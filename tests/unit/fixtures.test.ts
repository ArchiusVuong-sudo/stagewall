import { describe, expect, it } from "vitest";
import { DEMO_INPUTS } from "@/lib/demo-inputs";
import { DEFAULT_HOUSE_RULES } from "@/lib/repo";
import { loadFixtures, ReplayProvider } from "@/lib/screener/replay-provider";
import { verdictSchema } from "@/lib/screener/verdict";
import { scrub, scrubName } from "@/lib/scrub";
import { SEED_QUEUE } from "@/lib/seed";

const asRequest = (m: { name: string; track: string; message: string }) => ({
  name: scrubName(m.name).text,
  track: m.track,
  message: scrub(m.message).text,
  houseRules: DEFAULT_HOUSE_RULES,
});

describe("replay fixtures", () => {
  const fixtures = loadFixtures();
  const provider = new ReplayProvider(fixtures, 0);

  it("cover every seed queue message and every demo or e2e message", () => {
    for (const m of [...SEED_QUEUE, ...DEMO_INPUTS]) expect(provider.has(asRequest(m)), m.message).toBe(true);
  });

  it("hold only schema-valid verdicts recorded from a real model", () => {
    for (const e of Object.values(fixtures.entries)) {
      expect(verdictSchema.safeParse(e.call.toolArgs).success).toBe(true);
      expect(e.call.model).toMatch(/^claude-/);
      expect(e.call.latencyMs).toBeGreaterThan(0);
    }
  });

  it("store scrubbed input only", () => {
    const inputs = JSON.stringify(Object.values(fixtures.entries).map((e) => e.input));
    expect(inputs).not.toContain("555-0134");
    expect(inputs).not.toContain("@ines_example");
  });
});
