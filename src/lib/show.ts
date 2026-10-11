/**
 * The invented activation this demo is built around. Everything here is
 * synthetic: the artist, album, venue city and tracks do not exist.
 */
export const SHOW = {
  id: "low-tide-lisbon",
  artist: "Juno Halcyon",
  album: "Low Tide Radio",
  city: "Lisbon",
  date: "2026-10-24",
  dateLabel: "24 Oct 2026",
  /** Every stored message is deleted this many days after the show. */
  retentionDays: 30,
} as const;

export interface Track {
  id: string;
  title: string;
  color: string;
}

export const TRACKS: readonly Track[] = [
  { id: "glasshouse", title: "Glasshouse", color: "#7dd3fc" },
  { id: "northbound", title: "Northbound", color: "#a78bfa" },
  { id: "paper-moons", title: "Paper Moons", color: "#fcd34d" },
  { id: "static-hearts", title: "Static Hearts", color: "#f472b6" },
  { id: "saltwater-hymn", title: "Saltwater Hymn", color: "#34d399" },
  { id: "afterlight", title: "Afterlight", color: "#fb923c" },
] as const;

export const TRACK_TITLES = TRACKS.map((t) => t.title) as [string, ...string[]];

export function trackColor(title: string): string {
  return TRACKS.find((t) => t.title === title)?.color ?? "#94a3b8";
}

/** The auto-delete moment: midnight UTC, retentionDays after the show. */
export function retentionDate(): Date {
  const d = new Date(`${SHOW.date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + SHOW.retentionDays);
  return d;
}

export function formatDay(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
