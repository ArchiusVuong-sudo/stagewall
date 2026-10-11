import { publish } from "@/lib/bus";
import { getDb } from "@/lib/db";
import { json, ready } from "@/lib/http";
import { resetAll } from "@/lib/reset";
import { appCtx, enqueueScreening } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Restores the synthetic seed between demo takes. Local only; off when ALLOW_RESET=0. */
export async function POST(req: Request) {
  ready();
  if (process.env.ALLOW_RESET === "0") return json({ error: "Reset is off" }, 403);
  const host = new URL(req.url).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) return json({ error: "Local only" }, 403);
  const queued = resetAll(getDb());
  const ctx = appCtx();
  for (const id of queued) void enqueueScreening(ctx, id);
  publish({ type: "reset" });
  return json({ ok: true, queued: queued.length });
}
