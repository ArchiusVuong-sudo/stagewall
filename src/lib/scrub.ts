/**
 * Server-side scrubber. Runs on the name and the message before anything is
 * stored, screened or shown, so raw personal details never reach the disk,
 * the model or a moderator. It prefers removing too much over too little.
 */

export const REMOVAL_KINDS = ["email", "link", "handle", "phone", "address"] as const;
export type RemovalKind = (typeof REMOVAL_KINDS)[number];

export interface ScrubResult {
  text: string;
  removed: RemovalKind[];
}

export function removalTag(kind: RemovalKind): string {
  return `[${kind} removed]`;
}

const LETTER = "A-Za-zÀ-ÖØ-öø-ÿ";

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

const TLDS =
  "com|net|org|io|co|me|ly|gg|app|link|xyz|info|biz|tv|fm|to|pt|es|fr|de|uk|us|vn|kr|ph|br|mx|ar|ca|au|in|jp|it|nl|shop|store|site|online|live";
const LINK = new RegExp(
  String.raw`\b(?:https?:\/\/|www\.)[^\s<>"']+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:${TLDS})\b(?:\/[^\s<>"']*)?`,
  "gi",
);

const HANDLE = /(^|[^\w@])@[A-Za-z0-9_](?:[A-Za-z0-9_.]{0,28}[A-Za-z0-9_])?/g;

/** 7 to 15 digits with common separators; checked for digit count below. */
const PHONE = /(?:\+|\b)\d[\d\s().-]{5,20}\d\b|\(\d{2,4}\)[\d\s.-]{5,16}\d\b/g;

const STREET_SUFFIX =
  "street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|way|court|ct|place|pl|terrace|square|sq";
const ADDRESS_NUMBER_FIRST = new RegExp(
  String.raw`\b\d{1,5}[a-z]?,?\s+(?:[${LETTER}'.-]+\s+){1,4}(?:${STREET_SUFFIX})\b\.?`,
  "gi",
);
const STREET_PREFIX = "rua|avenida|av\\.|calle|carrer|rue|via|travessa|largo|praça|plaza|đường|duong";
const ADDRESS_PREFIX_FIRST = new RegExp(
  String.raw`\b(?:${STREET_PREFIX})\s+(?:[${LETTER}'.-]+\s+){0,4}[${LETTER}'.-]+,?\s*(?:n\.?º?\s*)?\d{1,5}[a-z]?\b`,
  "gi",
);

function digitCount(s: string): number {
  return (s.match(/\d/g) ?? []).length;
}

/** Remove personal details from free text and report what was removed. */
export function scrub(input: string): ScrubResult {
  const removed = new Set<RemovalKind>();
  let text = input.normalize("NFC");

  text = text.replace(EMAIL, () => {
    removed.add("email");
    return removalTag("email");
  });
  text = text.replace(LINK, () => {
    removed.add("link");
    return removalTag("link");
  });
  text = text.replace(HANDLE, (_m, lead: string) => {
    removed.add("handle");
    return `${lead}${removalTag("handle")}`;
  });
  text = text.replace(ADDRESS_PREFIX_FIRST, () => {
    removed.add("address");
    return removalTag("address");
  });
  text = text.replace(ADDRESS_NUMBER_FIRST, () => {
    removed.add("address");
    return removalTag("address");
  });
  text = text.replace(PHONE, (m) => {
    const n = digitCount(m);
    if (n < 7 || n > 15) return m;
    removed.add("phone");
    // Keep the whitespace the match swallowed at its edges.
    const lead = m.match(/^\s*/)?.[0] ?? "";
    return `${lead}${removalTag("phone")}`;
  });

  text = text.replace(/[ \t]{2,}/g, " ").trim();
  return { text, removed: REMOVAL_KINDS.filter((k) => removed.has(k)) };
}

/** Scrub a display name. Falls back to "Fan" if nothing is left. */
export function scrubName(input: string): ScrubResult {
  const r = scrub(input);
  const cleaned = r.text.replace(/\[(?:email|link|handle|phone|address) removed\]/g, "").replace(/\s+/g, " ").trim();
  return { text: cleaned || "Fan", removed: r.removed };
}
