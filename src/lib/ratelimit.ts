import { createHmac, randomBytes } from "node:crypto";

/**
 * Per-device rate limit without storing an IP. The key is an HMAC of the IP
 * with a salt that lives only in memory and changes every UTC day, so
 * yesterday's keys cannot be linked to today's or reversed.
 */
export class RateLimiter {
  private salt: Buffer = randomBytes(32);
  private saltDay: string;
  private hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {
    this.saltDay = this.day();
  }

  private day(): string {
    return new Date(this.now()).toISOString().slice(0, 10);
  }

  /** The salted hash used as the device key. */
  deviceKey(ip: string): string {
    if (this.day() !== this.saltDay) {
      this.salt = randomBytes(32);
      this.saltDay = this.day();
      this.hits.clear();
    }
    return createHmac("sha256", this.salt).update(ip).digest("hex").slice(0, 32);
  }

  /** Records a hit and says whether it is allowed. */
  check(ip: string): { allowed: boolean; retryAfterMs: number } {
    const key = this.deviceKey(ip);
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((x) => t - x < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return { allowed: false, retryAfterMs: this.windowMs - (t - recent[0]!) };
    }
    recent.push(t);
    this.hits.set(key, recent);
    return { allowed: true, retryAfterMs: 0 };
  }

  /** For inspection in tests: the stored keys never contain the IP. */
  keys(): string[] {
    return [...this.hits.keys()];
  }
}

const g = globalThis as typeof globalThis & { __stagewallLimiter?: RateLimiter };

export function submitLimiter(): RateLimiter {
  if (!g.__stagewallLimiter) {
    g.__stagewallLimiter = new RateLimiter(Number(process.env.RATE_LIMIT_MAX ?? 3), 5 * 60_000);
  }
  return g.__stagewallLimiter;
}

export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || headers.get("x-real-ip") || "local";
}
