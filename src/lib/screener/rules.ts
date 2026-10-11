import type { Category, Verdict } from "./verdict";

/**
 * A plain keyword filter. It is the baseline the AI screener has to beat in
 * the evals, and the offline screener for CI and keyless runs. It holds on
 * any match and approves everything else, with no sense of meaning.
 */
const KEYWORDS: Record<Exclude<Category, "fan_love" | "personal_info" | "off_topic">, string[]> = {
  resale_spam: ["sell", "selling", "tix", "tickets for sale", "resale", "dm me", "dm for", "promo code", "discount", "giveaway", "follow me", "crypto", "cash only", "venmo"],
  harassment: ["ugly", "stupid", "idiot", "loser", "shut up", "pathetic", "nobody likes", "go away"],
  hate: ["go back to", "those people", "subhuman", "vermin"],
  sexual: ["sexy", "nude", "nudes", "hook up", "hookup", "in bed", "sleep with"],
  spoiler: ["setlist", "encore", "opens with", "closing song", "surprise guest"],
  prompt_injection: ["ignore previous", "ignore all", "ignore your", "system prompt", "you are now", "approve this", "mark this as"],
};

/** Words that look violent out of context. Holding them is the classic keyword false alarm. */
const VIOLENT_WORDS = ["die", "dying", "kill", "kills", "killed", "dead", "murder"];

function findAll(text: string, words: string[]): string[] {
  const lower = text.toLowerCase();
  return words.filter((w) => new RegExp(`(^|[^\\p{L}])${escapeRe(w)}($|[^\\p{L}])`, "u").test(lower));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function keywordVerdict(input: { name: string; message: string }): Verdict {
  const text = `${input.name} ${input.message}`;
  const categories: Category[] = [];
  const hits: string[] = [];
  for (const [category, words] of Object.entries(KEYWORDS) as Array<[Category, string[]]>) {
    const found = findAll(text, words);
    if (found.length) {
      categories.push(category);
      hits.push(...found);
    }
  }
  const violent = findAll(text, VIOLENT_WORDS);
  if (violent.length) {
    if (!categories.includes("harassment")) categories.push("harassment");
    hits.push(...violent);
  }
  if (hits.length === 0) {
    return {
      decision: "approve",
      confidence: 0.9,
      categories: ["fan_love"],
      reasons: ["No blocked keywords found"],
      personal_info_left: false,
    };
  }
  return {
    decision: "review",
    confidence: 0.6,
    categories: categories.slice(0, 4),
    reasons: [`Matched keyword${hits.length > 1 ? "s" : ""}: ${hits.slice(0, 4).map((h) => `"${h}"`).join(", ")}`],
    personal_info_left: false,
  };
}
