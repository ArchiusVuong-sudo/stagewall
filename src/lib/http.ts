import type { ZodError } from "zod";
import { ensureBooted } from "./boot";

/** Start seeding and the screener in the background; never blocks a request on the probe. */
export function ready(): void {
  void ensureBooted();
}

export function json(data: unknown, init?: number | ResponseInit): Response {
  const opts = typeof init === "number" ? { status: init } : init;
  return Response.json(data, { ...opts, headers: { "Cache-Control": "no-store", ...(opts?.headers ?? {}) } });
}

export function invalid(err: ZodError): Response {
  const issue = err.issues[0];
  return json({ error: issue?.message ?? "Invalid input", field: issue?.path.join(".") || null }, 400);
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
