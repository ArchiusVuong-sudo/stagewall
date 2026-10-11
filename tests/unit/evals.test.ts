import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { caseRequest, loadCases, runEval, scoreRun } from "@/lib/evals";
import { ReplayProvider } from "@/lib/screener/replay-provider";
import { rulesOutcome, screenWithProvider } from "@/lib/screener/screen";
import type { EvalCaseResult, EvalRun } from "@/lib/types";

const cases = loadCases();

describe("eval set", () => {
  it("has 36 labelled cases in 7 languages covering every class", () => {
    expect(cases).toHaveLength(36);
    expect(new Set(cases.map((c) => c.lang)).size).toBe(7);
    expect(new Set(cases.map((c) => c.id)).size).toBe(36);
    for (const cat of ["fan love", "idiom trap", "resale spam", "harassment of another fan", "mild hate without slurs", "sexual request", "house-rule spoiler", "prompt injection", "personal details"]) {
      expect(cases.some((c) => c.category === cat)).toBe(true);
    }
  });

  it("uses only fictional contact details", () => {
    const text = cases.map((c) => c.message).join("\n");
    expect(text).not.toMatch(/@(?!example)[a-z0-9-]+\.[a-z]{2,}/i);
  });

  it("scores false approvals and false holds", () => {
    const r = (expected: "live" | "not_live", got: "live" | "not_live") => ({ expected, got }) as EvalCaseResult;
    const run = scoreRun([r("live", "live"), r("not_live", "live"), r("live", "not_live"), r("not_live", "not_live")], {
      id: "x",
      screener: "s",
      model: null,
      startedAt: "",
      durationMs: 0,
      costUsd: 0,
    });
    expect(run).toMatchObject({ total: 4, correct: 2, falseApprovals: 1, falseHolds: 1 });
  });

  it("runs the keyword baseline deterministically", async () => {
    const a = await runEval(cases, { screenerName: "Keyword filter", screen: async (req) => rulesOutcome(req) });
    const b = await runEval(cases, { screenerName: "Keyword filter", screen: async (req) => rulesOutcome(req) });
    expect(a.correct).toBe(b.correct);
    // The idiom traps are where a keyword filter fails.
    expect(a.results.filter((x) => x.category === "idiom trap" && x.got === "not_live").length).toBeGreaterThan(0);
  });

  it("replays the recorded live run and gets the committed numbers back", async () => {
    const committed = JSON.parse(readFileSync(path.join(process.cwd(), "evals", "results", "ai-screener.json"), "utf8")) as EvalRun;
    const provider = new ReplayProvider(undefined, 0);
    for (const c of cases) expect(provider.has(caseRequest(c)), `recording for ${c.id}`).toBe(true);
    const replay = await runEval(cases, { screenerName: "AI screener (replay)", screen: (req) => screenWithProvider(req, provider) });
    expect({ correct: replay.correct, fa: replay.falseApprovals, fh: replay.falseHolds }).toEqual({
      correct: committed.correct,
      fa: committed.falseApprovals,
      fh: committed.falseHolds,
    });
  });
});
