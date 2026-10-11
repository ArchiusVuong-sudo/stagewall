import { json, ready } from "@/lib/http";
import { appCtx, purge } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  ready();
  return json({ removed: purge(appCtx()) });
}
