import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { publish } from "./bus";
import type { DB } from "./db";
import { loadCases, runEval } from "./evals";
import { insertEvalRun, latestEvalRuns } from "./repo";
import { screenerState } from "./screener/mode";
import { rulesOutcome, screenWithProvider } from "./screener/screen";
import type { EvalRun } from "./types";

export const KEYWORD_NAME = "Keyword filter";

export function aiScreenerName(): string {
  const { mode } = screenerState();
  return mode === "replay" ? "AI screener (replay)" : "AI screener";
}

const g = globalThis as typeof globalThis & { __stagewallEvalRunning?: boolean };

export function evalRunning(): boolean {
  return !!g.__stagewallEvalRunning;
}

/** Runs the AI screener (in the current mode) and the keyword baseline on every case. */
export async function runEvalSuite(db: DB): Promise<EvalRun[]> {
  if (g.__stagewallEvalRunning) throw new Error("An eval is already running");
  g.__stagewallEvalRunning = true;
  try {
    const cases = loadCases();
    const keyword = await runEval(cases, {
      screenerName: KEYWORD_NAME,
      screen: async (req) => rulesOutcome(req),
      onProgress: (done, total) => publish({ type: "eval.progress", screener: KEYWORD_NAME, done, total }),
    });
    insertEvalRun(db, keyword);
    const provider = screenerState().provider;
    // Offline mode has no AI screener to compare; only the baseline runs.
    if (!provider) return [keyword];
    const name = aiScreenerName();
    const ai = await runEval(cases, {
      screenerName: name,
      screen: (req) => screenWithProvider(req, provider),
      concurrency: 4,
      onProgress: (done, total) => publish({ type: "eval.progress", screener: name, done, total }),
    });
    insertEvalRun(db, ai);
    return [ai, keyword];
  } finally {
    g.__stagewallEvalRunning = false;
    publish({ type: "eval.done" });
  }
}

export function resultsDir(): string {
  return path.join(process.cwd(), "evals", "results");
}

/** Loads the committed results of real runs (from npm run eval) into the database. */
export function importCommittedResults(db: DB): number {
  let n = 0;
  let files: string[] = [];
  try {
    files = readdirSync(resultsDir()).filter((f) => f.endsWith(".json"));
  } catch {
    return 0;
  }
  for (const f of files) {
    const run = JSON.parse(readFileSync(path.join(resultsDir(), f), "utf8")) as EvalRun;
    insertEvalRun(db, run);
    n++;
  }
  return n;
}

export function evalSummary(db: DB): EvalRun[] {
  return latestEvalRuns(db);
}
