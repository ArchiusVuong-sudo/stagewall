import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ReplayMissError, requestKey, type ProviderCall, type ScreenRequest, type VerdictProvider } from "./provider";

export const fixtureEntrySchema = z.object({
  input: z.object({ name: z.string(), track: z.string(), message: z.string() }),
  call: z.object({
    toolArgs: z.unknown(),
    model: z.string(),
    latencyMs: z.number(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    costUsd: z.number(),
  }),
  recordedAt: z.string(),
});

export const fixtureFileSchema = z.object({
  note: z.string(),
  entries: z.record(z.string(), fixtureEntrySchema),
});
export type FixtureFile = z.infer<typeof fixtureFileSchema>;
export type FixtureEntry = z.infer<typeof fixtureEntrySchema>;

export function fixturePath(): string {
  return process.env.REPLAY_FIXTURES ?? path.join(process.cwd(), "fixtures", "replay.json");
}

export function loadFixtures(file = fixturePath()): FixtureFile {
  try {
    return fixtureFileSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { note: "", entries: {} };
    throw err;
  }
}

/** Plays back responses recorded from real live runs (see scripts/record-fixtures.ts). */
export class ReplayProvider implements VerdictProvider {
  readonly kind = "replay" as const;
  private readonly entries: Record<string, FixtureEntry>;

  constructor(
    fixtures: FixtureFile = loadFixtures(),
    /** A short pause so the Screening state is visible, as it is live. */
    private readonly delayMs = Number(process.env.REPLAY_DELAY_MS ?? 700),
  ) {
    this.entries = fixtures.entries;
  }

  has(req: Pick<ScreenRequest, "name" | "track" | "message">): boolean {
    return requestKey(req) in this.entries;
  }

  async call(req: ScreenRequest): Promise<ProviderCall> {
    const entry = this.entries[requestKey(req)];
    if (!entry) throw new ReplayMissError();
    if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
    return entry.call;
  }
}

/** Wraps the live provider and keeps every successful call, to save as fixtures. */
export class RecordingProvider implements VerdictProvider {
  readonly kind = "live" as const;
  readonly recorded: Record<string, FixtureEntry> = {};

  constructor(private readonly inner: VerdictProvider) {}

  async call(req: ScreenRequest, signal?: AbortSignal): Promise<ProviderCall> {
    const call = await this.inner.call(req, signal);
    this.recorded[requestKey(req)] = {
      input: { name: req.name, track: req.track, message: req.message },
      call,
      recordedAt: new Date().toISOString(),
    };
    return call;
  }
}

export const FIXTURE_NOTE =
  "Responses recorded from real live Agent SDK runs by scripts/record-fixtures.ts and npm run eval. Synthetic inputs only.";

/** Merge new recordings into the fixture file, sorted for stable diffs. */
export function saveFixtures(add: Record<string, FixtureEntry>, file = fixturePath()): number {
  const current = loadFixtures(file);
  const entries = { ...current.entries, ...add };
  const sorted = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ note: FIXTURE_NOTE, entries: sorted }, null, 2) + "\n");
  return Object.keys(sorted).length;
}
