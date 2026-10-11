import { describe, expect, it } from "vitest";
import { hashToken, isTokenShape, newManageToken } from "@/lib/tokens";

describe("manage tokens", () => {
  it("are random, URL-safe and stored only as a SHA-256 hash", () => {
    const a = newManageToken();
    const b = newManageToken();
    expect(a.token).not.toBe(b.token);
    expect(isTokenShape(a.token)).toBe(true);
    expect(a.hash).toBe(hashToken(a.token));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("reject anything that is not a token", () => {
    expect(isTokenShape("../etc/passwd")).toBe(false);
    expect(isTokenShape("short")).toBe(false);
  });
});
