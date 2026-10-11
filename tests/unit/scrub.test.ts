import { describe, expect, it } from "vitest";
import { scrub, scrubName } from "@/lib/scrub";

describe("scrub", () => {
  it.each([
    ["text me (415) 555-0134", "text me [phone removed]"],
    ["call +44 7700 900123 tonight", "call [phone removed] tonight"],
    ["ring 07700 900456", "ring [phone removed]"],
    ["my cell 415.555.0199", "my cell [phone removed]"],
  ])("removes phone numbers: %s", (input, out) => {
    const r = scrub(input);
    expect(r.text).toBe(out);
    expect(r.removed).toEqual(["phone"]);
  });

  it("removes emails before handles, so an email is not read as a handle", () => {
    const r = scrub("write to ines@example.com or @ines_example");
    expect(r.text).toBe("write to [email removed] or [handle removed]");
    expect(r.removed).toEqual(["email", "handle"]);
  });

  it.each([
    "see https://example.com/tickets?id=4",
    "go to www.example.com",
    "merch at example.shop/sale",
    "example.co",
  ])("removes links: %s", (input) => {
    const r = scrub(input);
    expect(r.text).toContain("[link removed]");
    expect(r.text).not.toMatch(/example\./);
  });

  it.each([
    ["I live at 42 Oak Hill Street, come by", "I live at [address removed], come by"],
    ["moro na Rua das Flores 12, Lisboa", "moro na [address removed], Lisboa"],
    ["vivo en Calle Mayor, 7", "vivo en [address removed]"],
    ["15 Baker St.", "[address removed]"],
  ])("removes street addresses: %s", (input, out) => {
    expect(scrub(input).text).toBe(out);
  });

  it.each([
    "I'd die for this chorus",
    "Saw them 3 times in 2025 and again in 2026!",
    "Doors at 19:30 on 24 Oct, see you there",
    "Paper Moons 가사 듣고 울었어요",
    "Track 2 is the one, 10/10",
  ])("leaves ordinary fan text alone: %s", (input) => {
    expect(scrub(input)).toEqual({ text: input, removed: [] });
  });

  it("reports each kind once, in a fixed order", () => {
    const r = scrub("@a_fan 555-0134 @b_fan a@example.com 555-0199");
    expect(r.removed).toEqual(["email", "handle", "phone"]);
  });

  it("scrubs names and falls back to Fan when nothing is left", () => {
    expect(scrubName("Ines @ines_x")).toEqual({ text: "Ines", removed: ["handle"] });
    expect(scrubName("@only_handle").text).toBe("Fan");
  });
});
