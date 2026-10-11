import { json, ready } from "@/lib/http";
import { modeInfo } from "@/lib/status-info";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  ready();
  return json(modeInfo());
}
