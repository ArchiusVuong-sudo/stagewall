import { describe, expect, it, vi } from "vitest";
import { isRetryable, RetryableError, withRetry } from "@/lib/screener/retry";

const noSleep = { sleep: () => Promise.resolve() };

describe("withRetry", () => {
  it.each(["API Error: 529 Overloaded", "rate_limit_error", "429 Too Many Requests", "Agent SDK error 503: upstream", "socket hang up"])(
    "treats %s as retryable",
    (msg) => expect(isRetryable(new Error(msg))).toBe(true),
  );

  it.each(["Invalid API key", "The model did not call record_verdict", "Screening timed out after 30 s"])(
    "does not retry %s",
    (msg) => expect(isRetryable(new Error(msg))).toBe(false),
  );

  it("retries overloads and then succeeds", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new RetryableError("overloaded")).mockRejectedValueOnce(new Error("529")).mockResolvedValue("ok");
    await expect(withRetry(fn, noSleep)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("gives up after the attempt limit", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("overloaded"));
    await expect(withRetry(fn, { ...noSleep, attempts: 3 })).rejects.toThrow("overloaded");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("fails fast on errors that will not get better", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Invalid API key"));
    await expect(withRetry(fn, noSleep)).rejects.toThrow("Invalid API key");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("backs off exponentially", async () => {
    const waits: number[] = [];
    const fn = vi.fn().mockRejectedValue(new Error("overloaded"));
    await withRetry(fn, { attempts: 4, baseMs: 100, sleep: async (ms) => void waits.push(ms) }).catch(() => undefined);
    expect(waits).toHaveLength(3);
    expect(waits[1]! / waits[0]!).toBeGreaterThan(1.1);
    expect(waits[2]!).toBeGreaterThan(waits[0]!);
  });
});
