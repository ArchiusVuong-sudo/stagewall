import { z } from "zod";
import { invalid, json, readJson, ready } from "@/lib/http";
import { getSettings } from "@/lib/repo";
import { appCtx, updateThreshold } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ threshold: z.number().min(0.5).max(0.99) });

export async function PUT(req: Request) {
  ready();
  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return invalid(parsed.error);
  const ctx = appCtx();
  updateThreshold(ctx, Math.round(parsed.data.threshold * 100) / 100);
  return json({ settings: getSettings(ctx.db) });
}
