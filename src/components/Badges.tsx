import type { ModeInfo } from "@/lib/status-info";

export function SyntheticBadge({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const cls =
    tone === "dark"
      ? "border-white/15 bg-white/5 text-white/70"
      : "border-zinc-300 bg-white text-zinc-600";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden />
      Synthetic demo data
    </span>
  );
}

export function ModeBadge({ info, tone = "dark" }: { info: ModeInfo; tone?: "dark" | "light" }) {
  const label =
    info.mode === "live" ? `Live AI · ${info.model}` : info.mode === "replay" ? "Replay mode" : "Offline rules";
  const dot = info.mode === "live" ? "bg-emerald-400" : info.mode === "replay" ? "bg-sky-400" : "bg-zinc-400";
  const cls =
    tone === "dark"
      ? "border-white/15 bg-white/5 text-white/70"
      : "border-zinc-300 bg-white text-zinc-600";
  return (
    <span
      title={info.reason}
      data-testid="mode-badge"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      {label}
    </span>
  );
}

/** Renders scrubber tags such as [phone removed] as small chips. */
export function ScrubbedText({ text, tone = "dark" }: { text: string; tone?: "dark" | "light" }) {
  const parts = text.split(/(\[(?:email|link|handle|phone|address) removed\])/g);
  const chip =
    tone === "dark"
      ? "bg-white/10 text-white/70 ring-1 ring-white/15"
      : "bg-amber-50 text-amber-800 ring-1 ring-amber-200";
  return (
    <>
      {parts.map((p, i) =>
        /^\[\w+ removed\]$/.test(p) ? (
          <span key={i} className={`mx-0.5 whitespace-nowrap rounded px-1.5 py-px align-[1px] text-[0.8em] font-medium ${chip}`}>
            {p.slice(1, -1)}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
