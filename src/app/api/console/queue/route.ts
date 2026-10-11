import { getDb } from "@/lib/db";
import { json, ready } from "@/lib/http";
import { countMessages, getSettings, listByStatus } from "@/lib/repo";
import { modeInfo } from "@/lib/status-info";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  ready();
  const db = getDb();
  return json({
    messages: listByStatus(db, ["screening", "held", "live", "hidden"]),
    settings: getSettings(db),
    counts: countMessages(db),
    mode: modeInfo(),
  });
}
