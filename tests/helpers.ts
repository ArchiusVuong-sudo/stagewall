import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDb, type DB } from "@/lib/db";
import type { ScreenRequest } from "@/lib/screener/provider";
import type { ScreenOutcome } from "@/lib/screener/screen";
import type { Verdict } from "@/lib/screener/verdict";
import type { Ctx } from "@/lib/service";

export function tempDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), "stagewall-test-"));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export function tempDb(): { db: DB; file: string; cleanup: () => void } {
  const { dir, cleanup } = tempDir();
  const file = path.join(dir, "test.db");
  const db = openDb(file);
  return {
    db,
    file,
    cleanup: () => {
      if (db.open) db.close();
      cleanup();
    },
  };
}

export const approve = (confidence = 0.95, extra: Partial<Verdict> = {}): Verdict => ({
  decision: "approve",
  confidence,
  categories: ["fan_love"],
  reasons: ["Warm fan message"],
  personal_info_left: false,
  ...extra,
});

export function outcome(verdict: Verdict | null, extra: Partial<ScreenOutcome> = {}): ScreenOutcome {
  return {
    screener: "AI screener",
    verdict,
    toolArgs: verdict,
    model: "test-model",
    latencyMs: 1234,
    inputTokens: 100,
    outputTokens: 20,
    costUsd: 0.001,
    error: verdict ? null : "boom",
    ...extra,
  };
}

/** A context whose screener returns whatever the test says, and records what it saw. */
export function testCtx(db: DB, screen: (req: ScreenRequest) => ScreenOutcome | Promise<ScreenOutcome>) {
  const seen: ScreenRequest[] = [];
  let clock = new Date("2026-10-24T20:00:00Z");
  const ctx: Ctx = {
    db,
    screen: async (req) => {
      seen.push(req);
      return screen(req);
    },
    now: () => clock,
  };
  return {
    ctx,
    seen,
    setNow: (d: Date) => {
      clock = d;
    },
  };
}
