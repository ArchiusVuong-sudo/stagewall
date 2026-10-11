import type { Metadata } from "next";
import { ConsoleApp } from "@/components/console/ConsoleApp";
import { LiveProvider } from "@/components/LiveProvider";
import { TopBar } from "@/components/TopBar";
import { ready } from "@/lib/http";
import { modeInfo } from "@/lib/status-info";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Producer console - stagewall" };

export default function ConsolePage() {
  ready();
  return (
    <LiveProvider>
      <div className="flex h-screen flex-col bg-zinc-50 text-zinc-900">
        <TopBar active="/console" mode={modeInfo()} tone="light" />
        <ConsoleApp mode={modeInfo()} />
      </div>
    </LiveProvider>
  );
}
