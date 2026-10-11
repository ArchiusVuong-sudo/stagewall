import { getDb } from "@/lib/db";
import { json, ready } from "@/lib/http";
import { getMessage, getTrace } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  ready();
  const { id } = await params;
  const db = getDb();
  const message = getMessage(db, id);
  if (!message) return json({ error: "Not found" }, 404);
  return json({ message, trace: getTrace(db, id) });
}
