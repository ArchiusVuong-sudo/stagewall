/**
 * Run the eval set with the AI screener and the keyword baseline, print the
 * table, and save the results to evals/results/ (the app loads them on reset).
 * Live by default; DEMO_REPLAY=1 replays the recorded fixtures instead.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { KEYWORD_NAME, resultsDir } from "../src/lib/eval-service";
import { loadCases, runEval } from "../src/lib/evals";
import { RecordingProvider, ReplayProvider, saveFixtures } from "../src/lib/screener/replay-provider";
import { rulesOutcome, screenWithProvider } from "../src/lib/screener/screen";
import { SdkProvider } from "../src/lib/screener/sdk-provider";
import type { EvalRun } from "../src/lib/types";

function line(r: EvalRun): string {
  const acc = ((r.correct / r.total) * 100).toFixed(0);
  return `${r.screener.padEnd(24)} ${String(r.model ?? "none").padEnd(20)} ${`${acc}% (${r.correct}/${r.total})`.padEnd(14)} false approvals ${r.falseApprovals}  false holds ${r.falseHolds}  ${(r.durationMs / 1000).toFixed(1)} s  $${r.costUsd.toFixed(3)}`;
}

async function main() {
  const cases = loadCases();
  const replay = process.env.DEMO_REPLAY === "1";
  const recorder = replay ? null : new RecordingProvider(new SdkProvider());
  const provider = recorder ?? new ReplayProvider(undefined, 0);
  const aiName = replay ? "AI screener (replay)" : "AI screener";

  const keyword = await runEval(cases, { screenerName: KEYWORD_NAME, screen: async (req) => rulesOutcome(req) });
  const ai = await runEval(cases, {
    screenerName: aiName,
    concurrency: Number(process.env.EVAL_CONCURRENCY ?? 4),
    screen: (req) => screenWithProvider(req, provider),
    onProgress: (d, t) => process.stdout.write(`\r${aiName}: ${d}/${t}`),
  });
  process.stdout.write("\n");

  console.log(line(ai));
  console.log(line(keyword));
  for (const r of [ai, keyword]) {
    for (const x of r.results.filter((y) => y.got !== y.expected)) {
      console.log(`  miss [${r.screener}] ${x.id} expected ${x.expected}, got ${x.status}: ${x.message}`);
    }
  }

  if (!replay) {
    mkdirSync(resultsDir(), { recursive: true });
    writeFileSync(path.join(resultsDir(), "ai-screener.json"), JSON.stringify(ai, null, 2) + "\n");
    writeFileSync(path.join(resultsDir(), "keyword-filter.json"), JSON.stringify(keyword, null, 2) + "\n");
    console.log(`Saved to ${path.relative(process.cwd(), resultsDir())}/`);
    const total = saveFixtures(recorder!.recorded);
    console.log(`Recorded ${Object.keys(recorder!.recorded).length} calls into fixtures/replay.json (${total} entries)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
