import { invalid, json, readJson, ready } from "@/lib/http";
import { getSettings } from "@/lib/repo";
import { appCtx, rulesSchema, updateHouseRules } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  ready();
  const parsed = rulesSchema.safeParse(await readJson(req));
  if (!parsed.success) return invalid(parsed.error);
  const ctx = appCtx();
  updateHouseRules(ctx, parsed.data.rules);
  return json({ settings: getSettings(ctx.db) });
}
