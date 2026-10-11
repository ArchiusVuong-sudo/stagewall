import { ReplayMissError, type ProviderCall, type ScreenRequest, type VerdictProvider } from "./provider";
import { keywordVerdict } from "./rules";
import { verdictSchema, type Verdict } from "./verdict";

export type ScreenerLabel = "AI screener" | "AI screener (replay)" | "Offline rules" | "Offline rules (no recording)";

export interface ScreenOutcome {
  screener: ScreenerLabel;
  verdict: Verdict | null;
  /** Raw record_verdict arguments, kept for the trace even when invalid. */
  toolArgs: unknown;
  model: string | null;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  error: string | null;
}

export function rulesOutcome(req: ScreenRequest, label: ScreenerLabel = "Offline rules"): ScreenOutcome {
  const started = performance.now();
  const verdict = keywordVerdict(req);
  return {
    screener: label,
    verdict,
    toolArgs: verdict,
    model: null,
    latencyMs: Math.round(performance.now() - started),
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    error: null,
  };
}

/**
 * Screen one scrubbed message with a provider. Never throws: any failure
 * comes back as verdict null with the error text, and the policy holds it.
 */
export async function screenWithProvider(
  req: ScreenRequest,
  provider: VerdictProvider | null,
  signal?: AbortSignal,
): Promise<ScreenOutcome> {
  if (!provider) return rulesOutcome(req);
  const label: ScreenerLabel = provider.kind === "replay" ? "AI screener (replay)" : "AI screener";
  const started = Date.now();
  let call: ProviderCall;
  try {
    call = await provider.call(req, signal);
  } catch (err) {
    if (err instanceof ReplayMissError) return rulesOutcome(req, "Offline rules (no recording)");
    return {
      screener: label,
      verdict: null,
      toolArgs: null,
      model: null,
      latencyMs: Date.now() - started,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  const parsed = verdictSchema.safeParse(call.toolArgs);
  return {
    screener: label,
    verdict: parsed.success ? parsed.data : null,
    toolArgs: call.toolArgs,
    model: call.model,
    latencyMs: call.latencyMs,
    inputTokens: call.inputTokens,
    outputTokens: call.outputTokens,
    costUsd: call.costUsd,
    error: parsed.success ? null : `record_verdict arguments failed the schema: ${parsed.error.issues[0]?.message ?? "invalid"}`,
  };
}
