import { getDb } from "@/lib/db";
import { json, ready } from "@/lib/http";
import { countMessages, listAudit, recapRows } from "@/lib/repo";
import { retentionDate, SHOW } from "@/lib/show";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  ready();
  const db = getDb();
  return json({
    audit: listAudit(db, 60),
    counts: countMessages(db),
    recapCount: recapRows(db).length,
    retention: { date: retentionDate().toISOString(), days: SHOW.retentionDays, showDate: SHOW.date },
  });
}
