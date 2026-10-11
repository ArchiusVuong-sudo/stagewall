import type { MessageRecord } from "./types";

function cell(v: string): string {
  // Quote everything; neutralise spreadsheet formulas.
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Recap list: first name, track, message, time live. No ids, no consent-less rows. */
export function recapCsv(rows: MessageRecord[]): string {
  const header = ["first_name", "track", "message", "live_at", "synthetic"];
  const lines = rows
    .filter((r) => r.recapConsent && r.status === "live")
    .map((r) => [r.name, r.track, r.body, r.liveAt ?? "", r.synthetic ? "yes" : "no"].map(cell).join(","));
  return [header.join(","), ...lines].join("\n") + "\n";
}
