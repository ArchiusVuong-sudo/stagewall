import type { DB } from "./db";
import { DEFAULT_THRESHOLD, type MessageStatus } from "./policy";
import { verdictSchema } from "./screener/verdict";
import type { RemovalKind } from "./scrub";
import type {
  AuditActor,
  AuditEvent,
  EvalRun,
  FanView,
  MessageRecord,
  PublicMessage,
  Settings,
  TraceRecord,
} from "./types";

export const DEFAULT_HOUSE_RULES = [
  "Keep it about the music and the night.",
  "No ticket resale, giveaways or promotion.",
  "No comments about other fans' looks or bodies.",
];

interface MessageRow {
  id: string;
  name: string;
  track: string;
  body: string;
  removed: string;
  display_consent: number;
  recap_consent: number;
  status: MessageStatus;
  decided_by: MessageRecord["decidedBy"];
  verdict: string | null;
  screener: string | null;
  rules_version: number | null;
  manage_hash: string | null;
  created_at: string;
  decided_at: string | null;
  live_at: string | null;
  expires_at: string;
  seed: number;
  synthetic: number;
}

function toRecord(r: MessageRow): MessageRecord {
  const verdict = r.verdict ? verdictSchema.safeParse(JSON.parse(r.verdict)) : null;
  return {
    id: r.id,
    name: r.name,
    track: r.track,
    body: r.body,
    removed: JSON.parse(r.removed) as RemovalKind[],
    recapConsent: r.recap_consent === 1,
    status: r.status,
    decidedBy: r.decided_by,
    verdict: verdict?.success ? verdict.data : null,
    screener: r.screener,
    rulesVersion: r.rules_version,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
    liveAt: r.live_at,
    expiresAt: r.expires_at,
    seed: r.seed === 1,
    synthetic: r.synthetic === 1,
  };
}

export function toPublic(m: MessageRecord): PublicMessage {
  return { id: m.id, name: m.name, track: m.track, body: m.body, liveAt: m.liveAt ?? m.createdAt };
}

export function toFanView(m: MessageRecord): FanView {
  return {
    id: m.id,
    name: m.name,
    track: m.track,
    body: m.body,
    removed: m.removed,
    status: m.status,
    recapConsent: m.recapConsent,
    createdAt: m.createdAt,
  };
}

export interface NewMessage {
  id: string;
  name: string;
  track: string;
  body: string;
  removed: RemovalKind[];
  recapConsent: boolean;
  status: MessageStatus;
  manageHash: string | null;
  createdAt: string;
  expiresAt: string;
  seed?: boolean;
  decidedBy?: MessageRecord["decidedBy"];
  liveAt?: string | null;
}

export function insertMessage(db: DB, m: NewMessage): void {
  db.prepare(
    `INSERT INTO messages (id, name, track, body, removed, display_consent, recap_consent, status, decided_by,
       manage_hash, created_at, decided_at, live_at, expires_at, seed, synthetic)
     VALUES (@id, @name, @track, @body, @removed, 1, @recap, @status, @decidedBy,
       @manageHash, @createdAt, @decidedAt, @liveAt, @expiresAt, @seed, 1)`,
  ).run({
    id: m.id,
    name: m.name,
    track: m.track,
    body: m.body,
    removed: JSON.stringify(m.removed),
    recap: m.recapConsent ? 1 : 0,
    status: m.status,
    decidedBy: m.decidedBy ?? null,
    manageHash: m.manageHash,
    createdAt: m.createdAt,
    decidedAt: m.decidedBy ? m.createdAt : null,
    liveAt: m.liveAt ?? null,
    expiresAt: m.expiresAt,
    seed: m.seed ? 1 : 0,
  });
}

export function getMessage(db: DB, id: string): MessageRecord | null {
  const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(id) as MessageRow | undefined;
  return row ? toRecord(row) : null;
}

export function getByManageHash(db: DB, hash: string): MessageRecord | null {
  const row = db.prepare("SELECT * FROM messages WHERE manage_hash = ?").get(hash) as MessageRow | undefined;
  return row ? toRecord(row) : null;
}

export function listByStatus(db: DB, statuses: MessageStatus[]): MessageRecord[] {
  const marks = statuses.map(() => "?").join(", ");
  const rows = db
    .prepare(`SELECT * FROM messages WHERE status IN (${marks}) ORDER BY COALESCE(live_at, created_at) DESC`)
    .all(...statuses) as MessageRow[];
  return rows.map(toRecord);
}

export function listWall(db: DB, limit = 40): PublicMessage[] {
  const rows = db
    .prepare("SELECT * FROM messages WHERE status = 'live' ORDER BY live_at DESC LIMIT ?")
    .all(limit) as MessageRow[];
  return rows.map((r) => toPublic(toRecord(r)));
}

export interface StatusChange {
  status: MessageStatus;
  decidedBy: "policy" | "producer";
  at: string;
  verdict?: MessageRecord["verdict"];
  screener?: string;
  rulesVersion?: number;
}

export function updateStatus(db: DB, id: string, c: StatusChange): void {
  db.prepare(
    `UPDATE messages SET status = @status, decided_by = @decidedBy, decided_at = @at,
       live_at = CASE WHEN @status = 'live' THEN COALESCE(live_at, @at) ELSE NULL END,
       verdict = COALESCE(@verdict, verdict), screener = COALESCE(@screener, screener),
       rules_version = COALESCE(@rulesVersion, rules_version)
     WHERE id = @id`,
  ).run({
    id,
    status: c.status,
    decidedBy: c.decidedBy,
    at: c.at,
    verdict: c.verdict ? JSON.stringify(c.verdict) : null,
    screener: c.screener ?? null,
    rulesVersion: c.rulesVersion ?? null,
  });
}

/** Hard delete. The trace goes with it (ON DELETE CASCADE). */
export function deleteMessage(db: DB, id: string): boolean {
  return db.prepare("DELETE FROM messages WHERE id = ?").run(id).changes > 0;
}

export function insertTrace(db: DB, t: TraceRecord): void {
  db.prepare(
    `INSERT OR REPLACE INTO traces (message_id, screener, model, input, tool_args, latency_ms, input_tokens, output_tokens,
       cost_usd, rules_version, threshold, policy_status, policy_rule, error, created_at)
     VALUES (@messageId, @screener, @model, @input, @toolArgs, @latencyMs, @inputTokens, @outputTokens,
       @costUsd, @rulesVersion, @threshold, @policyStatus, @policyRule, @error, @createdAt)`,
  ).run({
    ...t,
    input: JSON.stringify(t.input),
    toolArgs: t.toolArgs === undefined ? null : JSON.stringify(t.toolArgs),
  });
}

interface TraceRow {
  message_id: string;
  screener: string;
  model: string | null;
  input: string;
  tool_args: string | null;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  rules_version: number;
  threshold: number;
  policy_status: string;
  policy_rule: string;
  error: string | null;
  created_at: string;
}

export function getTrace(db: DB, messageId: string): TraceRecord | null {
  const r = db.prepare("SELECT * FROM traces WHERE message_id = ?").get(messageId) as TraceRow | undefined;
  if (!r) return null;
  return {
    messageId: r.message_id,
    screener: r.screener,
    model: r.model,
    input: JSON.parse(r.input) as TraceRecord["input"],
    toolArgs: r.tool_args ? JSON.parse(r.tool_args) : null,
    latencyMs: r.latency_ms,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    costUsd: r.cost_usd,
    rulesVersion: r.rules_version,
    threshold: r.threshold,
    policyStatus: r.policy_status,
    policyRule: r.policy_rule,
    error: r.error,
    createdAt: r.created_at,
  };
}

export function audit(db: DB, action: string, actor: AuditActor, at = new Date().toISOString()): void {
  db.prepare("INSERT INTO audit (action, actor, at) VALUES (?, ?, ?)").run(action, actor, at);
}

export function listAudit(db: DB, limit = 50): AuditEvent[] {
  return db.prepare("SELECT id, action, actor, at FROM audit ORDER BY id DESC LIMIT ?").all(limit) as AuditEvent[];
}

export function getSettings(db: DB): Settings {
  const rows = db.prepare("SELECT key, value FROM settings").all() as Array<{ key: string; value: string }>;
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    threshold: map.has("threshold") ? Number(map.get("threshold")) : DEFAULT_THRESHOLD,
    houseRules: map.has("house_rules") ? (JSON.parse(map.get("house_rules")!) as string[]) : DEFAULT_HOUSE_RULES,
    rulesVersion: map.has("rules_version") ? Number(map.get("rules_version")) : 1,
  };
}

function setSetting(db: DB, key: string, value: string): void {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

export function saveThreshold(db: DB, threshold: number): void {
  setSetting(db, "threshold", String(threshold));
}

/** Saving the rules bumps the version, which the next screening records. */
export function saveHouseRules(db: DB, rules: string[]): number {
  const next = getSettings(db).rulesVersion + 1;
  db.transaction(() => {
    setSetting(db, "house_rules", JSON.stringify(rules));
    setSetting(db, "rules_version", String(next));
  })();
  return next;
}

/** Only live messages whose fans opted in to recap use. */
export function recapRows(db: DB): MessageRecord[] {
  const rows = db
    .prepare("SELECT * FROM messages WHERE status = 'live' AND recap_consent = 1 ORDER BY live_at ASC")
    .all() as MessageRow[];
  return rows.map(toRecord);
}

export function purgeExpired(db: DB, now = new Date()): number {
  return db.prepare("DELETE FROM messages WHERE expires_at <= ?").run(now.toISOString()).changes;
}

export function countMessages(db: DB): Record<MessageStatus, number> {
  const rows = db.prepare("SELECT status, COUNT(*) AS n FROM messages GROUP BY status").all() as Array<{
    status: MessageStatus;
    n: number;
  }>;
  const out: Record<MessageStatus, number> = { screening: 0, live: 0, held: 0, hidden: 0 };
  for (const r of rows) out[r.status] = r.n;
  return out;
}

export function insertEvalRun(db: DB, run: EvalRun): void {
  db.prepare(
    `INSERT OR REPLACE INTO eval_runs (id, screener, model, started_at, duration_ms, total, correct, false_approvals,
       false_holds, cost_usd, results)
     VALUES (@id, @screener, @model, @startedAt, @durationMs, @total, @correct, @falseApprovals, @falseHolds, @costUsd, @results)`,
  ).run({ ...run, results: JSON.stringify(run.results) });
}

interface EvalRow {
  id: string;
  screener: string;
  model: string | null;
  started_at: string;
  duration_ms: number;
  total: number;
  correct: number;
  false_approvals: number;
  false_holds: number;
  cost_usd: number;
  results: string;
}

/** Newest run per screener. */
export function latestEvalRuns(db: DB): EvalRun[] {
  const rows = db
    .prepare(
      `SELECT * FROM eval_runs e WHERE started_at = (SELECT MAX(started_at) FROM eval_runs WHERE screener = e.screener)
       ORDER BY screener`,
    )
    .all() as EvalRow[];
  return rows.map((r) => ({
    id: r.id,
    screener: r.screener,
    model: r.model,
    startedAt: r.started_at,
    durationMs: r.duration_ms,
    total: r.total,
    correct: r.correct,
    falseApprovals: r.false_approvals,
    falseHolds: r.false_holds,
    costUsd: r.cost_usd,
    results: JSON.parse(r.results),
  }));
}
