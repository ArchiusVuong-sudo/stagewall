import { checkpoint, type DB } from "./db";
import { importCommittedResults } from "./eval-service";
import { seedDb } from "./seed";

/** Wipe every table and restore the synthetic seed. Returns the ids waiting for screening. */
export function resetAll(db: DB, now = new Date()): string[] {
  db.transaction(() => {
    for (const t of ["traces", "messages", "audit", "settings", "eval_runs"]) db.prepare(`DELETE FROM ${t}`).run();
  })();
  const { queued } = seedDb(db, now);
  importCommittedResults(db);
  checkpoint(db);
  return queued;
}
