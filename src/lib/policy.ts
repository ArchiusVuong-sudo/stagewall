import type { Verdict } from "./screener/verdict";

export const MESSAGE_STATUSES = ["screening", "live", "held", "hidden"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

/** Rejects this sure or surer are hidden without a person. */
export const HIDE_AT = 0.9;
export const DEFAULT_THRESHOLD = 0.85;

export interface PolicyResult {
  status: Exclude<MessageStatus, "screening">;
  rule: string;
}

/**
 * The only place that decides what goes on screen. Pure and fail-closed:
 * a missing verdict (error, timeout, bad output) always waits for a person.
 */
export function applyPolicy(verdict: Verdict | null, threshold: number): PolicyResult {
  if (!verdict) {
    return { status: "held", rule: "No valid verdict, so a person decides (fail closed)" };
  }
  const c = verdict.confidence;
  switch (verdict.decision) {
    case "approve":
      if (verdict.personal_info_left) {
        return { status: "held", rule: "Approved, but personal details may remain" };
      }
      if (c >= threshold) {
        return { status: "live", rule: `Approved at ${fmt(c)}, at or above the ${fmt(threshold)} bar` };
      }
      return { status: "held", rule: `Approved at ${fmt(c)}, below the ${fmt(threshold)} bar` };
    case "reject":
      if (c >= HIDE_AT) {
        return { status: "hidden", rule: `Rejected at ${fmt(c)}, at or above ${fmt(HIDE_AT)}` };
      }
      return { status: "held", rule: `Rejected at ${fmt(c)}, below ${fmt(HIDE_AT)}, so a person decides` };
    case "review":
      return { status: "held", rule: "The screener asked for a person" };
  }
}

/** How many held messages a given threshold would publish. */
export function countWouldPublish(held: Array<{ verdict: Verdict | null }>, threshold: number): number {
  return held.filter((m) => applyPolicy(m.verdict, threshold).status === "live").length;
}

function fmt(n: number): string {
  return n.toFixed(2);
}
