import { describe, expect, it } from "vitest";
import { ReplayMissError, type VerdictProvider } from "@/lib/screener/provider";
import { screenWithProvider } from "@/lib/screener/screen";
import { approve } from "../helpers";

const req = { name: "Ines", track: "Glasshouse", message: "hello", houseRules: [] };

function provider(fn: () => Promise<unknown>, kind: "live" | "replay" = "live"): VerdictProvider {
  return {
    kind,
    call: async () => ({ toolArgs: await fn(), model: "m", latencyMs: 5, inputTokens: 1, outputTokens: 1, costUsd: 0 }),
  };
}

describe("screenWithProvider", () => {
  it("returns a parsed verdict from valid tool arguments", async () => {
    const r = await screenWithProvider(req, provider(async () => approve(0.9)));
    expect(r.verdict?.confidence).toBe(0.9);
    expect(r.error).toBeNull();
    expect(r.screener).toBe("AI screener");
  });

  it("scrubs personal details the model quotes back in its reasons", async () => {
    const r = await screenWithProvider(
      req,
      provider(async () => approve(0.9, { decision: "review", reasons: ["Spelled-out number (415-555-0134) bypassed removal"] })),
    );
    expect(r.verdict?.reasons[0]).toBe("Spelled-out number ([phone removed]) bypassed removal");
    expect(JSON.stringify(r.toolArgs)).not.toContain("555-0134");
  });

  it("never throws: provider errors come back as no verdict", async () => {
    const r = await screenWithProvider(req, provider(async () => Promise.reject(new Error("Screening timed out after 30 s"))));
    expect(r.verdict).toBeNull();
    expect(r.error).toMatch(/timed out/);
  });

  it("rejects tool arguments that fail the schema, keeping them for the trace", async () => {
    const bad = { decision: "approve", confidence: 3, categories: [], reasons: ["x"], personal_info_left: false };
    const r = await screenWithProvider(req, provider(async () => bad));
    expect(r.verdict).toBeNull();
    expect(r.toolArgs).toEqual(bad);
    expect(r.error).toMatch(/schema/);
  });

  it("falls back to labelled rules when replay has no recording", async () => {
    const r = await screenWithProvider(req, provider(async () => Promise.reject(new ReplayMissError()), "replay"));
    expect(r.screener).toBe("Offline rules (no recording)");
    expect(r.verdict?.decision).toBe("approve");
  });

  it("falls back too when the miss comes from another bundled copy of the error class", async () => {
    // Next puts provider.ts in several server chunks, so instanceof can fail.
    class OtherCopy extends Error {
      constructor() {
        super("No recorded response for this text");
        this.name = "ReplayMissError";
      }
    }
    const r = await screenWithProvider(req, provider(async () => Promise.reject(new OtherCopy()), "replay"));
    expect(r.screener).toBe("Offline rules (no recording)");
    expect(r.error).toBeNull();
  });

  it("uses the rules when there is no provider (offline mode)", async () => {
    const r = await screenWithProvider({ ...req, message: "selling tix" }, null);
    expect(r.screener).toBe("Offline rules");
    expect(r.verdict?.decision).toBe("review");
    expect(r.model).toBeNull();
  });
});
