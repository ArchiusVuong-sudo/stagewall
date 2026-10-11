import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "@/lib/db";
import { getMessage, getSettings, getTrace, listAudit, listWall } from "@/lib/repo";
import { fanDelete, fanView, producerDecide, purge, screenMessage, submitMessage, updateHouseRules, type Submission } from "@/lib/service";
import { subscribe, type LiveEvent } from "@/lib/bus";
import { approve, outcome, tempDb, testCtx } from "../helpers";

const ines: Submission = {
  name: "Ines",
  track: "Glasshouse",
  message: "Glasshouse got me through finals, text me (415) 555-0134",
  displayConsent: true,
  recapConsent: false,
};

let db: DB;
let cleanup: () => void;
let events: LiveEvent[];
let unsub: () => void;

beforeEach(() => {
  ({ db, cleanup } = tempDb());
  events = [];
  unsub = subscribe((e) => events.push(e));
});
afterEach(() => {
  unsub();
  cleanup();
});

describe("submit and screen", () => {
  it("stores only scrubbed text, starts in Screening and returns a private token", () => {
    const { ctx } = testCtx(db, () => outcome(approve()));
    const { token, view } = submitMessage(ctx, ines, { screenNow: false });
    expect(view.status).toBe("screening");
    expect(view.body).toBe("Glasshouse got me through finals, text me [phone removed]");
    expect(view.removed).toEqual(["phone"]);
    expect(token).toHaveLength(32);
    const row = db.prepare("SELECT manage_hash FROM messages").get() as { manage_hash: string };
    expect(row.manage_hash).not.toContain(token);
    expect(row.manage_hash).toHaveLength(64);
  });

  it("sends the screener the scrubbed text and the current house rules", async () => {
    const { ctx, seen } = testCtx(db, () => outcome(approve()));
    const { view } = submitMessage(ctx, ines, { screenNow: false });
    await screenMessage(ctx, view.id);
    expect(seen[0]!.message).not.toContain("555-0134");
    expect(seen[0]!.houseRules).toEqual(getSettings(db).houseRules);
  });

  it("publishes a clear approval to every screen and keeps a trace", async () => {
    const { ctx } = testCtx(db, () => outcome(approve(0.95)));
    const { view } = submitMessage(ctx, ines, { screenNow: false });
    expect(await screenMessage(ctx, view.id)).toBe("live");
    expect(listWall(db).map((m) => m.id)).toContain(view.id);
    expect(events).toContainEqual(expect.objectContaining({ type: "wall.add" }));
    expect(events).toContainEqual({ type: "status", id: view.id, status: "live" });
    const trace = getTrace(db, view.id)!;
    expect(trace.policyStatus).toBe("live");
    expect(trace.model).toBe("test-model");
    expect(trace.latencyMs).toBe(1234);
    expect(trace.input.message).toContain("[phone removed]");
  });

  it("fails closed: a screener error waits for a person and is never published", async () => {
    const { ctx } = testCtx(db, () => outcome(null, { error: "Screening timed out after 30 s" }));
    const { view } = submitMessage(ctx, ines, { screenNow: false });
    expect(await screenMessage(ctx, view.id)).toBe("held");
    expect(events.some((e) => e.type === "wall.add")).toBe(false);
    expect(getTrace(db, view.id)!.error).toMatch(/timed out/);
    expect(listAudit(db)[0]!.action).toBe("held for a person (screening failed)");
  });

  it("records the rules version the screening used", async () => {
    const { ctx, seen } = testCtx(db, () => outcome(approve()));
    const v = updateHouseRules(ctx, ["No setlist spoilers"]);
    expect(v).toBe(2);
    const { view } = submitMessage(ctx, ines, { screenNow: false });
    await screenMessage(ctx, view.id);
    expect(seen[0]!.houseRules).toEqual(["No setlist spoilers"]);
    expect(getTrace(db, view.id)!.rulesVersion).toBe(2);
    expect(getMessage(db, view.id)!.rulesVersion).toBe(2);
  });

  it("drops the result if the fan deleted the message while it was screening", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { ctx } = testCtx(db, async () => {
      await gate;
      return outcome(approve());
    });
    const { token, view } = submitMessage(ctx, ines, { screenNow: false });
    const pending = screenMessage(ctx, view.id);
    expect(fanDelete(ctx, token)).toBe(true);
    release();
    expect(await pending).toBeNull();
    expect(getMessage(db, view.id)).toBeNull();
    expect(events.some((e) => e.type === "wall.add")).toBe(false);
  });
});

describe("producer decisions", () => {
  it("approves, rejects and undoes, telling every screen", async () => {
    const { ctx } = testCtx(db, () => outcome(approve(0.6, { decision: "review" })));
    const { view } = submitMessage(ctx, ines, { screenNow: false });
    await screenMessage(ctx, view.id);
    expect(getMessage(db, view.id)!.status).toBe("held");

    expect(producerDecide(ctx, view.id, "approve")).toMatchObject({ ok: true, previous: "held", status: "live" });
    expect(listWall(db).map((m) => m.id)).toContain(view.id);

    expect(producerDecide(ctx, view.id, "reject")).toMatchObject({ ok: true, previous: "live", status: "hidden" });
    expect(events).toContainEqual({ type: "wall.remove", id: view.id });

    expect(producerDecide(ctx, view.id, "restore", "held")).toMatchObject({ ok: true, status: "held" });
    expect(getMessage(db, view.id)!.decidedBy).toBe("producer");
    expect(listAudit(db).map((a) => a.action).slice(0, 3)).toEqual(["undo", "rejected", "approved"]);
  });

  it("refuses to decide while screening or after a delete", () => {
    const { ctx } = testCtx(db, () => outcome(approve()));
    const { token, view } = submitMessage(ctx, ines, { screenNow: false });
    expect(producerDecide(ctx, view.id, "approve")).toEqual({ ok: false, error: "Still screening" });
    fanDelete(ctx, token);
    expect(producerDecide(ctx, view.id, "approve").ok).toBe(false);
  });
});

describe("fan data controls", () => {
  it("lets the fan see and delete their own message by token only", async () => {
    const { ctx } = testCtx(db, () => outcome(approve()));
    const { token, view } = submitMessage(ctx, ines, { screenNow: false });
    await screenMessage(ctx, view.id);
    expect(fanView(ctx, token)?.status).toBe("live");
    expect(fanView(ctx, "x".repeat(32))).toBeNull();

    expect(fanDelete(ctx, token)).toBe(true);
    expect(getMessage(db, view.id)).toBeNull();
    expect(getTrace(db, view.id)).toBeNull();
    expect(events).toContainEqual({ type: "wall.remove", id: view.id });
    expect(events).toContainEqual({ type: "status", id: view.id, status: "deleted" });
    expect(fanDelete(ctx, token)).toBe(false);
  });

  it("keeps an audit log with no text, names or ids", async () => {
    const { ctx } = testCtx(db, () => outcome(approve()));
    const { token, view } = submitMessage(ctx, ines, { screenNow: false });
    await screenMessage(ctx, view.id);
    fanDelete(ctx, token);
    const rows = db.prepare("SELECT * FROM audit").all() as Array<Record<string, unknown>>;
    expect(Object.keys(rows[0]!).sort()).toEqual(["action", "actor", "at", "id"]);
    const dump = JSON.stringify(rows);
    for (const leak of ["Ines", "Glasshouse", "finals", view.id, token]) expect(dump).not.toContain(leak);
    expect(rows.map((r) => r.action)).toContain("deleted by fan");
  });

  it("purges everything past the retention date, and nothing before it", async () => {
    const { ctx, setNow } = testCtx(db, () => outcome(approve()));
    const { view } = submitMessage(ctx, ines, { screenNow: false });
    await screenMessage(ctx, view.id);
    setNow(new Date("2026-11-22T23:59:00Z"));
    expect(purge(ctx)).toBe(0);
    setNow(new Date("2026-11-23T00:00:00Z"));
    expect(purge(ctx)).toBe(1);
    expect(getMessage(db, view.id)).toBeNull();
    expect(events).toContainEqual({ type: "wall.remove", id: view.id });
  });
});
