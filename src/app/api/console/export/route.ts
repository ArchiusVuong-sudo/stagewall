import { recapCsv } from "@/lib/csv";
import { getDb } from "@/lib/db";
import { ready } from "@/lib/http";
import { audit, recapRows } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Recap list: only live messages whose fans agreed to recap use. */
export async function GET() {
  ready();
  const db = getDb();
  const rows = recapRows(db);
  audit(db, `recap list exported (${rows.length} rows)`, "producer");
  return new Response(recapCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="stagewall-recap-synthetic.csv"',
      "Cache-Control": "no-store",
    },
  });
}
