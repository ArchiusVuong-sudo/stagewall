import { describe, expect, it } from "vitest";
import { applyPolicy, countWouldPublish, DEFAULT_THRESHOLD, HIDE_AT } from "@/lib/policy";
import { approve } from "../helpers";

describe("applyPolicy", () => {
  it("fails closed: no verdict waits for a person", () => {
    expect(applyPolicy(null, 0.5).status).toBe("held");
  });

  it("publishes approvals at or above the bar", () => {
    expect(applyPolicy(approve(DEFAULT_THRESHOLD), DEFAULT_THRESHOLD).status).toBe("live");
    expect(applyPolicy(approve(0.99), DEFAULT_THRESHOLD).status).toBe("live");
  });

  it("holds approvals below the bar", () => {
    const r = applyPolicy(approve(0.84), DEFAULT_THRESHOLD);
    expect(r.status).toBe("held");
    expect(r.rule).toMatch(/below the 0.85 bar/);
  });

  it("holds an approval that says personal details remain, however sure", () => {
    expect(applyPolicy(approve(0.99, { personal_info_left: true }), 0.5).status).toBe("held");
  });

  it("hides sure rejects and holds unsure ones", () => {
    const reject = (c: number) => approve(c, { decision: "reject", categories: ["harassment"] });
    expect(applyPolicy(reject(HIDE_AT), DEFAULT_THRESHOLD).status).toBe("hidden");
    expect(applyPolicy(reject(0.89), DEFAULT_THRESHOLD).status).toBe("held");
  });

  it("always holds review, even at full confidence", () => {
    expect(applyPolicy(approve(1, { decision: "review" }), 0.5).status).toBe("held");
  });

  it("counts how many held messages a lower bar would publish", () => {
    const held = [{ verdict: approve(0.78) }, { verdict: approve(0.72) }, { verdict: approve(0.9, { decision: "review" }) }, { verdict: null }];
    expect(countWouldPublish(held, 0.85)).toBe(0);
    expect(countWouldPublish(held, 0.75)).toBe(1);
    expect(countWouldPublish(held, 0.7)).toBe(2);
  });
});
