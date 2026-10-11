import type { MessageStatus } from "./policy";
import type { Verdict } from "./screener/verdict";
import type { RemovalKind } from "./scrub";

export interface MessageRecord {
  id: string;
  name: string;
  track: string;
  body: string;
  removed: RemovalKind[];
  recapConsent: boolean;
  status: MessageStatus;
  decidedBy: "policy" | "producer" | "seed" | null;
  verdict: Verdict | null;
  screener: string | null;
  rulesVersion: number | null;
  createdAt: string;
  decidedAt: string | null;
  liveAt: string | null;
  expiresAt: string;
  seed: boolean;
  synthetic: boolean;
}

/** What the venue screen and the public channel may see. */
export interface PublicMessage {
  id: string;
  name: string;
  track: string;
  body: string;
  liveAt: string;
}

/** What the fan's own phone sees about its message. */
export interface FanView {
  id: string;
  name: string;
  track: string;
  body: string;
  removed: RemovalKind[];
  status: MessageStatus;
  recapConsent: boolean;
  createdAt: string;
}

export interface TraceRecord {
  messageId: string;
  screener: string;
  model: string | null;
  input: { name: string; track: string; message: string; houseRules: string[] };
  toolArgs: unknown;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  rulesVersion: number;
  threshold: number;
  policyStatus: string;
  policyRule: string;
  error: string | null;
  createdAt: string;
}

export type AuditActor = "fan" | "policy" | "producer" | "retention" | "system";

export interface AuditEvent {
  id: number;
  action: string;
  actor: AuditActor;
  at: string;
}

export interface Settings {
  threshold: number;
  houseRules: string[];
  rulesVersion: number;
}

export interface EvalCaseResult {
  id: string;
  lang: string;
  category: string;
  message: string;
  expected: "live" | "not_live";
  got: "live" | "not_live";
  status: string;
  decision: string | null;
  confidence: number | null;
  reasons: string[];
  error: string | null;
}

export interface EvalRun {
  id: string;
  screener: string;
  model: string | null;
  startedAt: string;
  durationMs: number;
  total: number;
  correct: number;
  falseApprovals: number;
  falseHolds: number;
  costUsd: number;
  results: EvalCaseResult[];
}
