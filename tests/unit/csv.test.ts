import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { recapCsv } from "@/lib/csv";
import type { DB } from "@/lib/db";
import { recapRows } from "@/lib/repo";
import { producerDecide, screenMessage, submitMessage, type Submission } from "@/lib/service";
import type { MessageRecord } from "@/lib/types";
import { approve, outcome, tempDb, testCtx } from "../helpers";

let db: DB;
let cleanup: () => void;
beforeEach(() => ({ db, cleanup } = tempDb()));
afterEach(() => cleanup());

const msg = (name: string, message: string, recapConsent: boolean): Submission => ({
  name,
  track: "Afterlight",
  message,
  displayConsent: true,
  recapConsent,
});

describe("recap export", () => {
  it("includes only live messages whose fans opted in to recap use", async () => {
    const { ctx } = testCtx(db, () => outcome(approve()));
    const ids: Record<string, string> = {};
    for (const [n, m, c] of [
      ["Opted", "yes please use it", true],
      ["NoConsent", "screen only", false],
      ["Rejected", "opted in but rejected", true],
      ["Held", "opted in but held", true],
    ] as const) {
      const { view } = submitMessage(ctx, msg(n, m, c), { screenNow: false });
      ids[n] = view.id;
      await screenMessage(ctx, view.id);
    }
    producerDecide(ctx, ids.Rejected!, "reject");
    producerDecide(ctx, ids.Held!, "restore", "held");

    const csv = recapCsv(recapRows(db));
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("first_name,track,message,live_at,synthetic");
    expect(lines).toHaveLength(2);
    expect(csv).toContain('"Opted"');
    for (const name of ["NoConsent", "Rejected", "Held"]) expect(csv).not.toContain(name);
  });

  it("quotes cells and neutralises spreadsheet formulas", () => {
    const row = {
      name: "=HYPERLINK()",
      track: "Afterlight",
      body: 'she said "wow", twice',
      liveAt: "2026-10-24T20:00:00.000Z",
      recapConsent: true,
      status: "live",
      synthetic: true,
    } as MessageRecord;
    const line = recapCsv([row]).trim().split("\n")[1];
    expect(line).toBe(`"'=HYPERLINK()","Afterlight","she said ""wow"", twice","2026-10-24T20:00:00.000Z","yes"`);
  });
});
