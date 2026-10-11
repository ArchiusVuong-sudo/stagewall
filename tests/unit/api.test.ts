import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dir = mkdtempSync(path.join(tmpdir(), "stagewall-api-"));
process.env.DATA_DIR = dir;
process.env.RATE_LIMIT_MAX = "3";
// Each test posts from its own address through a trusted proxy header.
process.env.TRUST_PROXY = "1";

const { POST: submit } = await import("@/app/api/messages/route");
const manage = await import("@/app/api/manage/[token]/route");
const { GET: wall } = await import("@/app/api/wall/route");
const { POST: decide } = await import("@/app/api/console/decide/route");
const { ensureBooted } = await import("@/lib/boot");
const { closeDb } = await import("@/lib/db");

const post = (body: unknown, ip = "203.0.113.10") =>
  submit(
    new Request("http://127.0.0.1:4113/api/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    }),
  );
const params = (token: string) => ({ params: Promise.resolve({ token }) });

const valid = { name: "Tavi", track: "Paper Moons", message: "Paper Moons on vinyl tonight, my heart is full", displayConsent: true, recapConsent: true };

beforeAll(async () => {
  await ensureBooted();
});
afterAll(() => {
  closeDb();
  rmSync(dir, { recursive: true, force: true });
});

async function waitFor<T>(fn: () => Promise<T>, ok: (v: T) => boolean): Promise<T> {
  for (let i = 0; i < 100; i++) {
    const v = await fn();
    if (ok(v)) return v;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("timed out waiting");
}

describe("POST /api/messages", () => {
  it("validates input with clear messages", async () => {
    const res = await post({ ...valid, displayConsent: false });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "Tick the box to show it on the screen", field: "displayConsent" });
    expect((await post({ ...valid, name: "x".repeat(25) })).status).toBe(400);
    expect((await post({ ...valid, track: "Not A Track" })).status).toBe(400);
    expect((await post({ ...valid, message: "y".repeat(201) })).status).toBe(400);
  });

  it("quietly drops honeypot submissions without storing them", async () => {
    const before = ((await (await wall()).json()) as { messages: unknown[] }).messages.length;
    const res = await post({ ...valid, website: "http://spam.example" }, "203.0.113.99");
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true });
    const after = ((await (await wall()).json()) as { messages: unknown[] }).messages.length;
    expect(after).toBe(before);
  });

  it("accepts a message, screens it from the recorded run and puts it on the wall", async () => {
    const res = await post(valid, "203.0.113.20");
    expect(res.status).toBe(201);
    const { token, message } = (await res.json()) as { token: string; message: { id: string; status: string } };
    expect(message.status).toBe("screening");
    const view = await waitFor(
      async () => ((await (await manage.GET(new Request("http://x"), params(token))).json()) as { message: { status: string } }).message,
      (m) => m.status !== "screening",
    );
    expect(view.status).toBe("live");
    const onWall = ((await (await wall()).json()) as { messages: Array<{ id: string }> }).messages;
    expect(onWall.map((m) => m.id)).toContain(message.id);

    // The fan deletes it; the link then has nothing behind it.
    expect((await manage.DELETE(new Request("http://x"), params(token))).status).toBe(200);
    expect(await (await manage.GET(new Request("http://x"), params(token))).json()).toEqual({ message: null });
  });

  it("rate limits a device to 3 messages in 5 minutes", async () => {
    const ip = "198.51.100.77";
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await post(valid, ip)).status);
    expect(codes).toEqual([201, 201, 201, 429]);
  });
});

describe("POST /api/console/decide", () => {
  it("rejects malformed decisions", async () => {
    const res = await decide(new Request("http://x", { method: "POST", body: JSON.stringify({ id: "nope", action: "approve" }) }));
    expect(res.status).toBe(400);
    const undo = await decide(
      new Request("http://x", { method: "POST", body: JSON.stringify({ id: crypto.randomUUID(), action: "restore" }) }),
    );
    expect(undo.status).toBe(400);
  });
});
