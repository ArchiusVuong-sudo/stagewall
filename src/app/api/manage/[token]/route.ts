import { json, ready } from "@/lib/http";
import { appCtx, fanDelete, fanView } from "@/lib/service";
import { isTokenShape } from "@/lib/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

/** The fan's private view of their own message, by manage token. */
export async function GET(_req: Request, { params }: Params) {
  ready();
  const { token } = await params;
  if (!isTokenShape(token)) return json({ error: "Not found" }, 404);
  const view = fanView(appCtx(), token);
  return view ? json({ message: view }) : json({ error: "Not found" }, 404);
}

/** Hard delete by the fan. It leaves every screen at once. */
export async function DELETE(_req: Request, { params }: Params) {
  ready();
  const { token } = await params;
  if (!isTokenShape(token)) return json({ error: "Not found" }, 404);
  return fanDelete(appCtx(), token) ? json({ ok: true }) : json({ error: "Not found" }, 404);
}
