import type { Metadata } from "next";
import { LiveProvider } from "@/components/LiveProvider";
import { VenueScreen } from "@/components/VenueScreen";
import { getDb } from "@/lib/db";
import { ready } from "@/lib/http";
import { joinUrl, qrSvg } from "@/lib/qr";
import { listWall } from "@/lib/repo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Venue screen - stagewall" };

export default async function ScreenPage() {
  ready();
  const url = await joinUrl();
  const svg = await qrSvg(url);
  return (
    <LiveProvider>
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="aspect-video max-h-screen w-full max-w-[calc(100vh*16/9)]">
          <VenueScreen initial={listWall(getDb())} qrSvg={svg} joinUrl={url} />
        </div>
      </div>
    </LiveProvider>
  );
}
