import type { Metadata } from "next";
import { FanApp } from "@/components/FanApp";
import { LiveProvider } from "@/components/LiveProvider";
import { TopBar } from "@/components/TopBar";
import { VenueScreen } from "@/components/VenueScreen";
import { getDb } from "@/lib/db";
import { ready } from "@/lib/http";
import { joinUrl, qrSvg } from "@/lib/qr";
import { listWall } from "@/lib/repo";
import { modeInfo } from "@/lib/status-info";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Live hub - stagewall" };

/** The demo hub: a fan's phone next to the venue screen, on one event stream. */
export default async function LivePage() {
  ready();
  const url = await joinUrl();
  const [svg, wall] = [await qrSvg(url), listWall(getDb())];
  return (
    <LiveProvider>
      <div className="stage-bg flex h-screen min-h-[860px] flex-col">
        <TopBar active="/live" mode={modeInfo()} />
        <main className="flex min-h-0 flex-1 items-center gap-10 px-10 py-6">
          <section className="flex shrink-0 flex-col items-center gap-3">
            <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-white/40">Fan phone</p>
            <div className="relative h-[740px] w-[360px] rounded-[48px] bg-[#05060b] p-3 shadow-2xl shadow-black/60 ring-1 ring-white/15">
              <div className="absolute left-1/2 top-3 z-10 h-6 w-28 -translate-x-1/2 rounded-b-2xl bg-[#05060b]" aria-hidden />
              <div className="h-full overflow-hidden rounded-[38px] bg-gradient-to-b from-[#16142b] to-[#0b0c14] pt-4" data-testid="phone">
                <FanApp framed />
              </div>
            </div>
          </section>
          <section className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-white/40">Venue screen</p>
              <p className="text-[12px] text-white/40">Updates over one live connection</p>
            </div>
            <div className="aspect-video w-full overflow-hidden rounded-2xl shadow-2xl shadow-black/50 ring-1 ring-white/10">
              <VenueScreen initial={wall} qrSvg={svg} joinUrl={url} />
            </div>
          </section>
        </main>
      </div>
    </LiveProvider>
  );
}
