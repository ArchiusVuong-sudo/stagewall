import { invalid, json, readJson, ready } from "@/lib/http";
import { appCtx, decisionSchema, producerDecide } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  ready();
  const parsed = decisionSchema.safeParse(await readJson(req));
  if (!parsed.success) return invalid(parsed.error);
  const { id, action, to } = parsed.data;
  if (action === "restore" && !to) return json({ error: "Undo needs the earlier status" }, 400);
  const result = producerDecide(appCtx(), id, action, to);
  return result.ok ? json(result) : json({ error: result.error }, 409);
}
