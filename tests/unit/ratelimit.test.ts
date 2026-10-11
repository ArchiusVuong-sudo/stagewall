import { describe, expect, it } from "vitest";
import { clientIp, RateLimiter } from "@/lib/ratelimit";

describe("RateLimiter", () => {
  it("allows 3 per 5 minutes per device, then blocks until the window passes", () => {
    let now = Date.parse("2026-10-24T20:00:00Z");
    const rl = new RateLimiter(3, 5 * 60_000, () => now);
    expect([1, 2, 3].map(() => rl.check("203.0.113.7").allowed)).toEqual([true, true, true]);
    const blocked = rl.check("203.0.113.7");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(rl.check("198.51.100.2").allowed).toBe(true);
    now += 5 * 60_000 + 1;
    expect(rl.check("203.0.113.7").allowed).toBe(true);
  });

  it("never keeps the IP: keys are salted hashes", () => {
    const rl = new RateLimiter(3, 60_000);
    rl.check("203.0.113.7");
    expect(rl.keys()).toHaveLength(1);
    expect(rl.keys()[0]).not.toContain("203.0.113.7");
    expect(rl.keys()[0]).toMatch(/^[0-9a-f]{32}$/);
  });

  it("rotates the salt each day, so keys cannot be linked across days", () => {
    let now = Date.parse("2026-10-24T23:59:00Z");
    const rl = new RateLimiter(3, 60_000, () => now);
    const a = rl.deviceKey("203.0.113.7");
    expect(rl.deviceKey("203.0.113.7")).toBe(a);
    now = Date.parse("2026-10-25T00:01:00Z");
    expect(rl.deviceKey("203.0.113.7")).not.toBe(a);
  });

  it("reads the client IP from proxy headers only behind a trusted proxy", () => {
    const fwd = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
    expect(clientIp(fwd, true)).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }), true)).toBe("198.51.100.2");
    expect(clientIp(new Headers(), true)).toBe("local");
  });

  it("ignores client-set proxy headers by default, so changing them cannot reset the limit", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7" }), false)).toBe("local");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }), false)).toBe("local");
    const rl = new RateLimiter(3, 60_000);
    const ips = ["203.0.113.1", "203.0.113.2", "203.0.113.3", "203.0.113.4"];
    const allowed = ips.map((ip) => rl.check(clientIp(new Headers({ "x-forwarded-for": ip }), false)).allowed);
    expect(allowed).toEqual([true, true, true, false]);
  });
});
