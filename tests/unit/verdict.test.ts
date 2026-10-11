import { describe, expect, it } from "vitest";
import { verdictSchema } from "@/lib/screener/verdict";
import { approve } from "../helpers";

describe("record_verdict schema", () => {
  it("accepts a well-formed verdict", () => {
    expect(verdictSchema.safeParse(approve()).success).toBe(true);
  });

  it.each([
    ["unknown decision", { ...approve(), decision: "maybe" }],
    ["confidence above 1", { ...approve(), confidence: 1.2 }],
    ["no reasons", { ...approve(), reasons: [] }],
    ["unknown category", { ...approve(), categories: ["vibes"] }],
    ["extra keys", { ...approve(), publish_now: true }],
    ["missing personal_info_left", { decision: "approve", confidence: 0.9, categories: [], reasons: ["ok"] }],
  ])("rejects %s", (_label, value) => {
    expect(verdictSchema.safeParse(value).success).toBe(false);
  });
});
