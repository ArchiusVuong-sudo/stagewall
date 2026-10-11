"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { SHOW, trackColor } from "@/lib/show";
import type { PublicMessage } from "@/lib/types";
import { ScrubbedText } from "./Badges";
import { useLive, useLiveConnected } from "./LiveProvider";

const VISIBLE = 7;

/** The big screen at the venue. Live messages only, pushed over SSE. */
export function VenueScreen({ initial, qrSvg, joinUrl }: { initial: PublicMessage[]; qrSvg: string; joinUrl: string }) {
  const [wall, setWall] = useState<PublicMessage[]>(initial);
  const connected = useLiveConnected();

  useLive((e) => {
    if (e.type === "wall.add") {
      setWall((w) => [e.message, ...w.filter((m) => m.id !== e.message.id)].slice(0, 60));
    } else if (e.type === "wall.remove") {
      setWall((w) => w.filter((m) => m.id !== e.id));
    }
  });

  const [spot, ...rest] = wall;
  const grid = rest.slice(0, VISIBLE - 1);

  return (
    <div className="cq stage-bg relative h-full w-full overflow-hidden text-white" data-testid="venue-screen">
      <div className="flex h-full flex-col p-[2.4cqw]">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[0.95cqw] font-semibold uppercase tracking-[0.3em] text-violet-300/80">Listening party</p>
            <h2 className="mt-[0.4cqw] text-[3.4cqw] font-semibold leading-none tracking-tight">{SHOW.album}</h2>
            <p className="mt-[0.6cqw] text-[1.2cqw] text-white/60">
              {SHOW.artist} · {SHOW.city} · {SHOW.dateLabel}
            </p>
          </div>
          <div className="flex items-center gap-[0.8cqw] text-[0.95cqw]">
            <span className="flex items-center gap-[0.5cqw] rounded-full bg-white/5 px-[1cqw] py-[0.45cqw] text-white/70 ring-1 ring-white/10">
              <span className={`h-[0.6cqw] w-[0.6cqw] rounded-full ${connected ? "bg-emerald-400 pulse-dot" : "bg-zinc-500"}`} />
              {wall.length} live
            </span>
            <span className="rounded-full bg-amber-400/10 px-[1cqw] py-[0.45cqw] text-amber-200/90 ring-1 ring-amber-300/20">
              Synthetic demo data
            </span>
          </div>
        </div>

        <div className="mt-[2cqw] grid min-h-0 flex-1 grid-cols-[1fr_17cqw] gap-[1.6cqw]">
          <div className="flex min-h-0 flex-col gap-[1.2cqw]">
            <div className="min-h-[13cqw]">
              <AnimatePresence mode="popLayout" initial={false}>
                {spot ? (
                  <motion.article
                    key={spot.id}
                    layout
                    initial={{ opacity: 0, y: 24, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ type: "spring", stiffness: 260, damping: 26 }}
                    data-testid="wall-card"
                    className="relative overflow-hidden rounded-[1.4cqw] bg-white/[0.07] p-[1.8cqw] ring-1 ring-white/10 backdrop-blur"
                  >
                    <div className="absolute inset-y-0 left-0 w-[0.45cqw]" style={{ background: trackColor(spot.track) }} />
                    <p className="text-[2.2cqw] font-medium leading-[1.25] tracking-tight">
                      <ScrubbedText text={spot.body} />
                    </p>
                    <p className="mt-[1cqw] text-[1.15cqw] text-white/60">
                      <span className="font-semibold text-white/90">{spot.name}</span>
                      <span className="mx-[0.6cqw] text-white/30">/</span>
                      <span style={{ color: trackColor(spot.track) }}>{spot.track}</span>
                    </p>
                  </motion.article>
                ) : (
                  <div className="flex h-[13cqw] items-center justify-center rounded-[1.4cqw] border border-dashed border-white/15 text-[1.3cqw] text-white/40">
                    The wall is empty. Scan the code to send the first message.
                  </div>
                )}
              </AnimatePresence>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-3 content-start gap-[1cqw]">
              <AnimatePresence mode="popLayout" initial={false}>
                {grid.map((m) => (
                  <motion.article
                    key={m.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.94 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    data-testid="wall-card"
                    className="relative overflow-hidden rounded-[1cqw] bg-white/[0.045] p-[1.1cqw] ring-1 ring-white/[0.08]"
                  >
                    <div className="absolute inset-x-0 top-0 h-[0.25cqw]" style={{ background: trackColor(m.track), opacity: 0.85 }} />
                    <p className="line-clamp-3 text-[1.2cqw] leading-snug text-white/90">
                      <ScrubbedText text={m.body} />
                    </p>
                    <p className="mt-[0.6cqw] truncate text-[0.9cqw] text-white/50">
                      <span className="font-semibold text-white/75">{m.name}</span> · {m.track}
                    </p>
                  </motion.article>
                ))}
              </AnimatePresence>
            </div>
          </div>

          <aside className="flex flex-col gap-[1cqw]">
            <div className="rounded-[1.2cqw] bg-white p-[1.1cqw] text-zinc-900">
              <div className="aspect-square w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
              <p className="mt-[0.8cqw] text-center text-[1.15cqw] font-semibold">Scan to add yours</p>
              <p className="truncate text-center text-[0.8cqw] text-zinc-500">{joinUrl.replace(/^https?:\/\//, "")}</p>
            </div>
            <div className="rounded-[1.2cqw] bg-white/[0.04] p-[1.1cqw] text-[0.9cqw] leading-relaxed text-white/55 ring-1 ring-white/[0.08]">
              Every message is screened before it shows. Phone numbers, emails, links and handles are removed first. You can delete yours at any
              time from your phone.
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
