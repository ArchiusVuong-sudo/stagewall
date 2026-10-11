/**
 * Restore the synthetic seed. If the app is running, ask it (so open screens
 * reload and the seed queue is screened); otherwise reset the file directly.
 */
import { closeDb, dbPath, getDb } from "../src/lib/db";
import { resetAll } from "../src/lib/reset";

async function main() {
  const port = process.env.PORT ?? "4113";
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/reset`, { method: "POST" });
    if (res.ok) {
      const body = (await res.json()) as { queued: number };
      console.log(`Reset through the running app on port ${port}. ${body.queued} seed messages are screening now.`);
      return;
    }
    console.log(`The app answered ${res.status}; resetting the file directly.`);
  } catch {
    // Not running.
  }
  const queued = resetAll(getDb());
  closeDb();
  console.log(`Reset ${dbPath()}. ${queued.length} seed messages will be screened on the next start.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
