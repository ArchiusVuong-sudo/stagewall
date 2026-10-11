/** Delete every message past the retention date. */
import { closeDb, dbPath, getDb } from "../src/lib/db";
import { purge, type Ctx } from "../src/lib/service";
import { formatDay, retentionDate } from "../src/lib/show";

const ctx: Ctx = {
  db: getDb(),
  screen: () => Promise.reject(new Error("not used")),
  now: () => new Date(),
};
const removed = purge(ctx);
closeDb();
console.log(`Purged ${removed} expired message${removed === 1 ? "" : "s"} from ${dbPath()}. Auto-delete date: ${formatDay(retentionDate())}.`);
