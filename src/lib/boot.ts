import { getDb } from "./db";
import { listByStatus } from "./repo";
import { fallBackToReplay, screenerState } from "./screener/mode";
import { SdkProvider } from "./screener/sdk-provider";
import { resetAll } from "./reset";
import { isSeeded } from "./seed";
import { appCtx, enqueueScreening, purge } from "./service";

const g = globalThis as typeof globalThis & { __stagewallBoot?: Promise<void> };

/** Seed on first start, then check live calls work, then screen anything waiting. */
export function ensureBooted(): Promise<void> {
  if (!g.__stagewallBoot) g.__stagewallBoot = boot();
  return g.__stagewallBoot;
}

async function boot(): Promise<void> {
  const db = getDb();
  if (!isSeeded(db)) resetAll(db);

  const state = screenerState();
  if (state.mode === "live") {
    // Probe (and warm up) the Agent SDK. Any failure switches to replay, labelled in the UI.
    try {
      await new SdkProvider(undefined, 25_000).call({
        name: "Probe",
        track: "Glasshouse",
        message: "Warm-up check before the doors open",
        houseRules: [],
      });
      console.log(`[screener] live: ${state.reason}`);
    } catch (err) {
      const reason = `Live check failed: ${err instanceof Error ? err.message.slice(0, 120) : String(err)}`;
      console.warn(`[screener] ${reason}. Using replay mode.`);
      fallBackToReplay(reason);
    }
  } else {
    console.log(`[screener] ${state.mode}: ${state.reason}`);
  }

  const ctx = appCtx();
  for (const m of listByStatus(db, ["screening"])) void enqueueScreening(ctx, m.id);

  // Retention purge every hour.
  const timer = setInterval(() => {
    try {
      purge(appCtx(), { auditWhenEmpty: false });
    } catch (err) {
      console.error("[retention] purge failed", err);
    }
  }, 60 * 60_000);
  timer.unref();
}
