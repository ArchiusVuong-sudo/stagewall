import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { mapLimit } from "./limit";
import { applyPolicy, DEFAULT_THRESHOLD } from "./policy";
import { DEFAULT_HOUSE_RULES } from "./repo";
import type { ScreenRequest } from "./screener/provider";
import type { ScreenOutcome } from "./screener/screen";
import { scrub, scrubName } from "./scrub";
import { TRACK_TITLES } from "./show";
import type { EvalCaseResult, EvalRun } from "./types";

/** Fixed rules for evals, so runs are comparable across days. */
export const EVAL_HOUSE_RULES = [
  ...DEFAULT_HOUSE_RULES,
  "No setlist spoilers: do not reveal song order, the encore or guests.",
];

export const evalCaseSchema = z.object({
  id: z.string(),
  lang: z.string(),
  category: z.string(),
  name: z.string().min(1).max(24),
  track: z.enum(TRACK_TITLES),
  message: z.string().min(1).max(200),
  expected: z.enum(["live", "not_live"]),
});
export type EvalCase = z.infer<typeof evalCaseSchema>;

export function casesPath(): string {
  return path.join(process.cwd(), "evals", "cases.jsonl");
}

export function loadCases(file = casesPath()): EvalCase[] {
  return readFileSync(/*turbopackIgnore: true*/ file, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l, i) => {
      const parsed = evalCaseSchema.safeParse(JSON.parse(l));
      if (!parsed.success) throw new Error(`evals line ${i + 1}: ${parsed.error.issues[0]?.message}`);
      return parsed.data;
    });
}

/** The same scrub the app runs before screening. */
export function caseRequest(c: EvalCase): ScreenRequest {
  return {
    name: scrubName(c.name).text,
    track: c.track,
    message: scrub(c.message).text,
    houseRules: EVAL_HOUSE_RULES,
  };
}

export interface EvalOptions {
  screenerName: string;
  screen: (req: ScreenRequest) => Promise<ScreenOutcome>;
  threshold?: number;
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
  now?: () => Date;
}

/** Runs every case through scrub, screener and policy, and scores the outcome. */
export async function runEval(cases: EvalCase[], opts: EvalOptions): Promise<EvalRun> {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const startedAt = (opts.now ?? (() => new Date()))();
  const t0 = Date.now();
  let done = 0;
  let model: string | null = null;
  let cost = 0;
  opts.onProgress?.(0, cases.length);
  const results = await mapLimit(cases, opts.concurrency ?? 4, async (c): Promise<EvalCaseResult> => {
    const req = caseRequest(c);
    const outcome = await opts.screen(req);
    const policy = applyPolicy(outcome.verdict, threshold);
    model = model ?? outcome.model;
    cost += outcome.costUsd;
    done++;
    opts.onProgress?.(done, cases.length);
    return {
      id: c.id,
      lang: c.lang,
      category: c.category,
      message: req.message,
      expected: c.expected,
      got: policy.status === "live" ? "live" : "not_live",
      status: policy.status,
      decision: outcome.verdict?.decision ?? null,
      confidence: outcome.verdict?.confidence ?? null,
      reasons: outcome.verdict?.reasons ?? [],
      error: outcome.error,
    };
  });
  return scoreRun(results, {
    id: randomUUID(),
    screener: opts.screenerName,
    model,
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - t0,
    costUsd: Math.round(cost * 10000) / 10000,
  });
}

export function scoreRun(
  results: EvalCaseResult[],
  meta: Pick<EvalRun, "id" | "screener" | "model" | "startedAt" | "durationMs" | "costUsd">,
): EvalRun {
  return {
    ...meta,
    total: results.length,
    correct: results.filter((r) => r.got === r.expected).length,
    falseApprovals: results.filter((r) => r.expected === "not_live" && r.got === "live").length,
    falseHolds: results.filter((r) => r.expected === "live" && r.got === "not_live").length,
    results,
  };
}
