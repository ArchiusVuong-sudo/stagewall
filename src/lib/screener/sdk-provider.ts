import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createSdkMcpServer, query, tool, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { buildSystemPrompt, buildUserPrompt, QUALIFIED_TOOL_NAME, SERVER_NAME, TOOL_NAME } from "./prompt";
import type { ProviderCall, ScreenRequest, VerdictProvider } from "./provider";
import { RetryableError, withRetry } from "./retry";
import { verdictShape } from "./verdict";

export const DEFAULT_MODEL = "claude-sonnet-5-5";
export const CALL_TIMEOUT_MS = 30_000;

export function screenerModel(): string {
  return process.env.SCREENER_MODEL?.trim() || DEFAULT_MODEL;
}

/**
 * The child process gets only these variables. Everything else (including
 * CLAUDECODE and CLAUDE_CODE_* from a parent session) stays behind.
 */
export function childEnv(source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of ["PATH", "HOME", "USER", "LANG", "TMPDIR"] as const) {
    const v = source[key];
    if (v) env[key] = v;
  }
  if (source.ANTHROPIC_API_KEY) env.ANTHROPIC_API_KEY = source.ANTHROPIC_API_KEY;
  env.CLAUDE_AGENT_SDK_CLIENT_APP = "stagewall/0.1";
  return env;
}

/** Runs one isolated Agent SDK query per message with a single allowed tool. */
export class SdkProvider implements VerdictProvider {
  readonly kind = "live" as const;

  constructor(
    private readonly model = screenerModel(),
    private readonly timeoutMs = CALL_TIMEOUT_MS,
  ) {}

  call(req: ScreenRequest, signal?: AbortSignal): Promise<ProviderCall> {
    return withRetry(() => this.once(req, signal), {
      onRetry: (attempt, err, waitMs) =>
        console.warn(`[screener] retry ${attempt} in ${waitMs} ms: ${err instanceof Error ? err.message : err}`),
    });
  }

  private async once(req: ScreenRequest, outer?: AbortSignal): Promise<ProviderCall> {
    let captured: unknown = undefined;
    const recordVerdict = tool(
      TOOL_NAME,
      "Record your screening verdict for the fan message. Call exactly once.",
      verdictShape,
      async (args) => {
        captured = args;
        return { content: [{ type: "text", text: "Verdict recorded." }] };
      },
    );
    const server = createSdkMcpServer({ name: SERVER_NAME, version: "0.1.0", tools: [recordVerdict] });

    const cwd = await mkdtemp(path.join(tmpdir(), "stagewall-screen-"));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const onOuterAbort = () => controller.abort();
    outer?.addEventListener("abort", onOuterAbort, { once: true });
    const started = Date.now();
    try {
      const q = query({
        prompt: buildUserPrompt(req),
        options: {
          model: this.model,
          systemPrompt: buildSystemPrompt(req.houseRules),
          tools: [],
          mcpServers: { [SERVER_NAME]: server },
          allowedTools: [QUALIFIED_TOOL_NAME],
          permissionMode: "dontAsk",
          permissionPrompts: "none",
          settingSources: [],
          strictMcpConfig: true,
          persistSession: false,
          cwd,
          env: childEnv(),
          maxTurns: 2,
          abortController: controller,
        },
      });

      let result: Extract<SDKMessage, { type: "result" }> | undefined;
      try {
        for await (const msg of q) {
          if (msg.type === "result") result = msg;
        }
      } catch (err) {
        // The SDK throws on error results. A verdict already recorded still counts.
        if (captured === undefined) throw err;
      }
      if (controller.signal.aborted && captured === undefined) {
        throw new Error(`Screening timed out after ${Math.round(this.timeoutMs / 1000)} s`);
      }
      if (!result && captured === undefined) throw new Error("Agent SDK returned no result");
      if (result?.is_error && captured === undefined) {
        const status = "api_error_status" in result ? result.api_error_status : undefined;
        const detail =
          ("errors" in result && result.errors?.join("; ")) ||
          ("result" in result && result.result) ||
          result.subtype;
        const text = `Agent SDK error${status ? ` ${status}` : ""}: ${detail}`;
        if (status && (status === 429 || status >= 500)) throw new RetryableError(text);
        throw new Error(text);
      }
      if (captured === undefined) throw new Error("The model did not call record_verdict");

      const usage = result?.usage;
      return {
        toolArgs: captured,
        model: this.model,
        latencyMs: Date.now() - started,
        inputTokens:
          (usage?.input_tokens ?? 0) +
          (usage?.cache_read_input_tokens ?? 0) +
          (usage?.cache_creation_input_tokens ?? 0),
        outputTokens: usage?.output_tokens ?? 0,
        costUsd: result?.total_cost_usd ?? 0,
      };
    } catch (err) {
      if (controller.signal.aborted && captured === undefined) {
        throw new Error(`Screening timed out after ${Math.round(this.timeoutMs / 1000)} s`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener("abort", onOuterAbort);
      await rm(cwd, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
