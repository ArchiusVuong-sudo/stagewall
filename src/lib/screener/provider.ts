import { createHash } from "node:crypto";

/** What the screener sees: already scrubbed of personal details. */
export interface ScreenRequest {
  name: string;
  track: string;
  message: string;
  houseRules: string[];
}

/** One model call: the raw tool arguments plus what it cost. */
export interface ProviderCall {
  toolArgs: unknown;
  model: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export type ProviderKind = "live" | "replay";

/** Live (Agent SDK) and replay (recorded fixtures) both implement this. */
export interface VerdictProvider {
  readonly kind: ProviderKind;
  call(req: ScreenRequest, signal?: AbortSignal): Promise<ProviderCall>;
}

/** Thrown by the replay provider when no recording matches the input. */
export class ReplayMissError extends Error {
  constructor() {
    super("No recorded response for this text");
    this.name = "ReplayMissError";
  }
}

/**
 * Checks by name, not instanceof: Next bundles this module into several server
 * chunks, so the provider cached on globalThis can throw another copy of the class.
 */
export function isReplayMiss(err: unknown): boolean {
  return err instanceof Error && err.name === "ReplayMissError";
}

/** Stable key for a request, used to store and find recorded responses. */
export function requestKey(req: Pick<ScreenRequest, "name" | "track" | "message">): string {
  const canonical = JSON.stringify({
    name: req.name.trim(),
    track: req.track.trim(),
    message: req.message.trim(),
  });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 24);
}
