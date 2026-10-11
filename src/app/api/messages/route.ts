import { invalid, json, readJson, ready } from "@/lib/http";
import { clientIp, submitLimiter } from "@/lib/ratelimit";
import { appCtx, submissionSchema, submitMessage } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A fan sends a message. Validated, rate limited, scrubbed, then screened in the background. */
export async function POST(req: Request) {
  ready();
  const body = (await readJson(req)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return json({ error: "Send JSON" }, 400);

  // Honeypot: a hidden field people never fill. Bots get a quiet fake success.
  if (typeof body.website === "string" && body.website.length > 0) {
    return json({ ok: true }, 202);
  }

  const parsed = submissionSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);

  const limit = submitLimiter().check(clientIp(req.headers));
  if (!limit.allowed) {
    const mins = Math.ceil(limit.retryAfterMs / 60_000);
    return json(
      { error: `Too many messages from this device. Try again in ${mins} min.` },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
    );
  }

  const result = submitMessage(appCtx(), parsed.data);
  return json({ token: result.token, message: result.view }, 201);
}
