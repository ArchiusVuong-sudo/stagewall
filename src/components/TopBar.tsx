import Link from "next/link";
import type { ModeInfo } from "@/lib/status-info";
import { ModeBadge, SyntheticBadge } from "./Badges";

const LINKS = [
  { href: "/live", label: "Live hub" },
  { href: "/screen", label: "Venue screen" },
  { href: "/join", label: "Fan page" },
  { href: "/console", label: "Producer console" },
];

export function TopBar({ active, mode, tone = "dark" }: { active: string; mode: ModeInfo; tone?: "dark" | "light" }) {
  const dark = tone === "dark";
  return (
    <header
      className={`flex h-14 shrink-0 items-center justify-between border-b px-6 ${
        dark ? "border-white/10 text-white" : "border-zinc-200 bg-white text-zinc-900"
      }`}
    >
      <div className="flex items-center gap-8">
        <Link href="/live" className="flex items-center gap-2.5">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">stagewall</span>
        </Link>
        <nav className="flex items-center gap-1 text-[13px]">
          {LINKS.map((l) => {
            const on = l.href === active;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={on ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                  on
                    ? dark
                      ? "bg-white/10 text-white"
                      : "bg-zinc-900 text-white"
                    : dark
                      ? "text-white/60 hover:bg-white/5 hover:text-white"
                      : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex items-center gap-2">
        <ModeBadge info={mode} tone={tone} />
        <SyntheticBadge tone={tone} />
      </div>
    </header>
  );
}

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#151729" />
      <rect x="7" y="9" width="18" height="4" rx="2" fill="#8b7cf6" />
      <rect x="7" y="15" width="12" height="4" rx="2" fill="#34d399" />
      <rect x="7" y="21" width="15" height="4" rx="2" fill="#f472b6" />
    </svg>
  );
}
