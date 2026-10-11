/**
 * Record real live screener responses for every fixed input the app replays:
 * the seed queue, the demo walkthrough messages and the e2e messages.
 * (npm run eval records the eval cases.) Needs a Claude login or ANTHROPIC_API_KEY.
 *   npm run record            only inputs without a recording
 *   npm run record -- --all   re-record everything
 */
import { DEMO_INPUTS } from "../src/lib/demo-inputs";
import { mapLimit } from "../src/lib/limit";
import { DEFAULT_HOUSE_RULES } from "../src/lib/repo";
import type { ScreenRequest } from "../src/lib/screener/provider";
import { loadFixtures, RecordingProvider, ReplayProvider, saveFixtures } from "../src/lib/screener/replay-provider";
import { SdkProvider } from "../src/lib/screener/sdk-provider";
import { scrub, scrubName } from "../src/lib/scrub";
import { SEED_QUEUE } from "../src/lib/seed";

async function main() {
  const all = process.argv.includes("--all");
  const inputs: ScreenRequest[] = [
    ...SEED_QUEUE.map((m) => ({ name: m.name, track: m.track, message: m.message })),
    ...DEMO_INPUTS.map((m) => ({ name: m.name, track: m.track, message: m.message })),
  ].map((m) => ({
    name: scrubName(m.name).text,
    track: m.track,
    message: scrub(m.message).text,
    houseRules: DEFAULT_HOUSE_RULES,
  }));

  const existing = new ReplayProvider(loadFixtures(), 0);
  const todo = all ? inputs : inputs.filter((r) => !existing.has(r));
  console.log(`Recording ${todo.length} of ${inputs.length} inputs live`);
  const recorder = new RecordingProvider(new SdkProvider());
  let failed = 0;
  await mapLimit(todo, 3, async (req) => {
    try {
      const call = await recorder.call(req);
      console.log(`  ok ${call.latencyMs} ms  ${req.message.slice(0, 60)}`);
    } catch (err) {
      failed++;
      console.error(`  failed: ${req.message.slice(0, 60)}: ${err instanceof Error ? err.message : err}`);
    }
  });
  const total = saveFixtures(recorder.recorded);
  console.log(`Saved ${Object.keys(recorder.recorded).length} new recordings, ${total} entries in fixtures/replay.json`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
