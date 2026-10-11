import { z } from "zod";

/** Categories the screener may attach to a message. */
export const CATEGORIES = [
  "fan_love",
  "resale_spam",
  "harassment",
  "hate",
  "sexual",
  "spoiler",
  "prompt_injection",
  "personal_info",
  "off_topic",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const DECISIONS = ["approve", "review", "reject"] as const;
export type Decision = (typeof DECISIONS)[number];

/**
 * Input shape of the record_verdict tool. The same shape validates the
 * arguments again on our side, so a malformed call can never reach the policy.
 */
export const verdictShape = {
  decision: z
    .enum(DECISIONS)
    .describe("approve = fine for the venue screen, review = a person should look, reject = must not be shown"),
  confidence: z.number().min(0).max(1).describe("How sure you are of the decision, 0 to 1"),
  categories: z.array(z.enum(CATEGORIES)).max(4).describe("Every category that applies; fan_love for a normal message"),
  reasons: z
    .array(z.string().min(1).max(200))
    .min(1)
    .max(3)
    .describe("One to three short plain-English reasons a moderator can read at a glance"),
  personal_info_left: z
    .boolean()
    .describe("True if the text still identifies or locates a person: a spelled-out number, a full name with a school, a home address in words"),
};

export const verdictSchema = z.object(verdictShape).strict();
export type Verdict = z.infer<typeof verdictSchema>;
