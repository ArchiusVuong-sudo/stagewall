import { randomUUID } from "node:crypto";
import { z } from "zod";
import { publish } from "./bus";
import { checkpoint, getDb, type DB } from "./db";
import { createLimiter } from "./limit";
import { applyPolicy, type MessageStatus } from "./policy";
import {
  audit,
  deleteMessage,
  getByManageHash,
  getMessage,
  getSettings,
  insertMessage,
  insertTrace,
  listByStatus,
  purgeExpired,
  saveHouseRules,
  saveThreshold,
  toFanView,
  toPublic,
  updateStatus,
} from "./repo";
import { screenerState } from "./screener/mode";
import type { ScreenRequest } from "./screener/provider";
import { screenWithProvider, type ScreenOutcome } from "./screener/screen";
import { scrub, scrubName, type RemovalKind } from "./scrub";
import { retentionDate, TRACK_TITLES } from "./show";
import { hashToken, newManageToken } from "./tokens";
import type { FanView } from "./types";

export interface Ctx {
  db: DB;
  screen: (req: ScreenRequest) => Promise<ScreenOutcome>;
  now: () => Date;
}

export function appCtx(): Ctx {
  return {
    db: getDb(),
    screen: (req) => screenWithProvider(req, screenerState().provider),
    now: () => new Date(),
  };
}

export const submissionSchema = z.object({
  name: z.string().trim().min(1, "Add your first name").max(24, "Keep the name to 24 characters"),
  track: z.enum(TRACK_TITLES, { message: "Pick a track" }),
  message: z.string().trim().min(1, "Write a message").max(200, "Keep it to 200 characters"),
  displayConsent: z.literal(true, { message: "Tick the box to show it on the screen" }),
  recapConsent: z.boolean().default(false),
});
export type Submission = z.infer<typeof submissionSchema>;

export interface SubmitResult {
  token: string;
  view: FanView;
}

/** Scrub, store, then screen in the background. Raw input is never written anywhere. */
export function submitMessage(ctx: Ctx, input: Submission, opts: { screenNow?: boolean } = {}): SubmitResult {
  const name = scrubName(input.name);
  const body = scrub(input.message);
  const removed = [...new Set<RemovalKind>([...name.removed, ...body.removed])];
  const { token, hash } = newManageToken();
  const id = randomUUID();
  const now = ctx.now().toISOString();
  insertMessage(ctx.db, {
    id,
    name: name.text,
    track: input.track,
    body: body.text,
    removed,
    recapConsent: input.recapConsent,
    status: "screening",
    manageHash: hash,
    createdAt: now,
    expiresAt: retentionDate().toISOString(),
  });
  audit(ctx.db, "message submitted", "fan", now);
  publish({ type: "status", id, status: "screening" });
  publish({ type: "queue.changed" });
  if (opts.screenNow !== false) void enqueueScreening(ctx, id);
  const view = toFanView(getMessage(ctx.db, id)!);
  return { token, view };
}

const g = globalThis as typeof globalThis & { __stagewallScreenLimit?: ReturnType<typeof createLimiter> };
function screenLimit() {
  if (!g.__stagewallScreenLimit) g.__stagewallScreenLimit = createLimiter(Number(process.env.SCREEN_CONCURRENCY ?? 2));
  return g.__stagewallScreenLimit;
}

export function enqueueScreening(ctx: Ctx, id: string): Promise<MessageStatus | null> {
  return screenLimit()(() => screenMessage(ctx, id)).catch((err: unknown) => {
    console.error("[screener] job failed", err);
    return null;
  });
}

/** Screen one stored message, apply the policy, keep a trace, tell every screen. */
export async function screenMessage(ctx: Ctx, id: string): Promise<MessageStatus | null> {
  const msg = getMessage(ctx.db, id);
  if (!msg || msg.status !== "screening") return null;
  const settings = getSettings(ctx.db);
  const req: ScreenRequest = { name: msg.name, track: msg.track, message: msg.body, houseRules: settings.houseRules };
  const outcome = await ctx.screen(req);
  const policy = applyPolicy(outcome.verdict, settings.threshold);

  // The fan may have deleted it while it was screening.
  const still = getMessage(ctx.db, id);
  if (!still || still.status !== "screening") return null;

  const at = ctx.now().toISOString();
  ctx.db.transaction(() => {
    updateStatus(ctx.db, id, {
      status: policy.status,
      decidedBy: "policy",
      at,
      verdict: outcome.verdict,
      screener: outcome.screener,
      rulesVersion: settings.rulesVersion,
    });
    insertTrace(ctx.db, {
      messageId: id,
      screener: outcome.screener,
      model: outcome.model,
      input: req,
      toolArgs: outcome.toolArgs,
      latencyMs: outcome.latencyMs,
      inputTokens: outcome.inputTokens,
      outputTokens: outcome.outputTokens,
      costUsd: outcome.costUsd,
      rulesVersion: settings.rulesVersion,
      threshold: settings.threshold,
      policyStatus: policy.status,
      policyRule: policy.rule,
      error: outcome.error,
      createdAt: at,
    });
    const action =
      policy.status === "live" ? "auto-published" : policy.status === "hidden" ? "auto-hidden" : "held for a person";
    audit(ctx.db, outcome.error ? `${action} (screening failed)` : action, "policy", at);
  })();

  const updated = getMessage(ctx.db, id)!;
  if (updated.status === "live") publish({ type: "wall.add", message: toPublic(updated) });
  publish({ type: "status", id, status: updated.status });
  publish({ type: "queue.changed" });
  return updated.status;
}

export type ProducerAction = "approve" | "reject" | "restore";

export const decisionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["approve", "reject", "restore"]),
  to: z.enum(["live", "held", "hidden"]).optional(),
});

/** A producer decision from the console. Undo is a restore to the earlier status. */
export function producerDecide(
  ctx: Ctx,
  id: string,
  action: ProducerAction,
  to?: Exclude<MessageStatus, "screening">,
): { ok: true; previous: MessageStatus; status: MessageStatus } | { ok: false; error: string } {
  const msg = getMessage(ctx.db, id);
  if (!msg) return { ok: false, error: "Message not found (the fan may have deleted it)" };
  if (msg.status === "screening") return { ok: false, error: "Still screening" };
  const target: Exclude<MessageStatus, "screening"> =
    action === "approve" ? "live" : action === "reject" ? "hidden" : (to ?? "held");
  const at = ctx.now().toISOString();
  ctx.db.transaction(() => {
    updateStatus(ctx.db, id, { status: target, decidedBy: "producer", at });
    audit(ctx.db, action === "approve" ? "approved" : action === "reject" ? "rejected" : "undo", "producer", at);
  })();
  const updated = getMessage(ctx.db, id)!;
  if (msg.status !== "live" && target === "live") publish({ type: "wall.add", message: toPublic(updated) });
  if (msg.status === "live" && target !== "live") publish({ type: "wall.remove", id });
  publish({ type: "status", id, status: target });
  publish({ type: "queue.changed" });
  return { ok: true, previous: msg.status, status: target };
}

export function fanView(ctx: Ctx, token: string): FanView | null {
  const msg = getByManageHash(ctx.db, hashToken(token));
  return msg ? toFanView(msg) : null;
}

/** Hard delete by the fan. Leaves only "deleted by fan", the actor and the time. */
export function fanDelete(ctx: Ctx, token: string): boolean {
  const msg = getByManageHash(ctx.db, hashToken(token));
  if (!msg) return false;
  const at = ctx.now().toISOString();
  ctx.db.transaction(() => {
    deleteMessage(ctx.db, msg.id);
    audit(ctx.db, "deleted by fan", "fan", at);
  })();
  checkpoint(ctx.db);
  publish({ type: "wall.remove", id: msg.id });
  publish({ type: "status", id: msg.id, status: "deleted" });
  publish({ type: "queue.changed" });
  return true;
}

export function updateThreshold(ctx: Ctx, threshold: number): void {
  saveThreshold(ctx.db, threshold);
  audit(ctx.db, `auto-publish bar set to ${threshold.toFixed(2)}`, "producer", ctx.now().toISOString());
  publish({ type: "settings.changed" });
}

export const rulesSchema = z.object({
  rules: z.array(z.string().trim().min(1).max(160)).max(12),
});

export function updateHouseRules(ctx: Ctx, rules: string[]): number {
  const version = saveHouseRules(ctx.db, rules);
  audit(ctx.db, `house rules saved (v${version})`, "producer", ctx.now().toISOString());
  publish({ type: "settings.changed" });
  return version;
}

/** Delete everything past the retention date. */
export function purge(ctx: Ctx, opts: { auditWhenEmpty?: boolean } = {}): number {
  const now = ctx.now();
  const goingLive = listByStatus(ctx.db, ["live"]).filter((m) => new Date(m.expiresAt) <= now);
  const n = purgeExpired(ctx.db, now);
  if (n > 0 || opts.auditWhenEmpty !== false) {
    audit(ctx.db, `retention purge removed ${n} message${n === 1 ? "" : "s"}`, "retention", now.toISOString());
  }
  checkpoint(ctx.db);
  for (const m of goingLive) publish({ type: "wall.remove", id: m.id });
  publish({ type: "queue.changed" });
  return n;
}
