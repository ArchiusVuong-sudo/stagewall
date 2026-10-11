/** Errors worth another try: overload, rate limits, 5xx, dropped connections. */
export function isRetryable(err: unknown): boolean {
  // By name, not instanceof: a bundled server chunk can hold another copy of the class.
  if (err instanceof Error && err.name === "RetryableError") return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /overloaded|rate[ _-]?limit|too many requests|\b(429|5\d\d)\b|ECONNRESET|ETIMEDOUT|socket hang up|temporarily unavailable/i.test(
    msg,
  );
}

export class RetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableError";
  }
}

export interface RetryOptions {
  attempts?: number;
  baseMs?: number;
  maxMs?: number;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (attempt: number, err: unknown, waitMs: number) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Retry with exponential backoff and jitter, only for retryable errors. */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 4;
  const baseMs = opts.baseMs ?? 1000;
  const maxMs = opts.maxMs ?? 8000;
  const sleep = opts.sleep ?? defaultSleep;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt === attempts || !isRetryable(err)) throw err;
      const wait = Math.min(maxMs, baseMs * 2 ** (attempt - 1)) * (0.75 + Math.random() * 0.5);
      opts.onRetry?.(attempt, err, Math.round(wait));
      await sleep(wait);
    }
  }
  throw lastErr;
}
