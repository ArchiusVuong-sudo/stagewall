import { getDb } from "@/lib/db";
import { json, ready } from "@/lib/http";
import { listWall } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  ready();
  return json({ messages: listWall(getDb()) });
}
