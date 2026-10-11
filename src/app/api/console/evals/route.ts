import { getDb } from "@/lib/db";
import { evalRunning, evalSummary, runEvalSuite } from "@/lib/eval-service";
import { loadCases } from "@/lib/evals";
import { json, ready } from "@/lib/http";
import { modeInfo } from "@/lib/status-info";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  ready();
  return json({ runs: evalSummary(getDb()), running: evalRunning(), cases: loadCases().length, mode: modeInfo() });
}

/** Starts a run in the background; progress arrives over the event stream. */
export async function POST() {
  ready();
  if (evalRunning()) return json({ error: "An eval is already running" }, 409);
  void runEvalSuite(getDb()).catch((err) => console.error("[evals] run failed", err));
  return json({ started: true }, 202);
}
