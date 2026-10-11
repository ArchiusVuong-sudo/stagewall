import type { Metadata } from "next";
import { FanApp } from "@/components/FanApp";
import { LiveProvider } from "@/components/LiveProvider";

export const metadata: Metadata = { title: "Send a message - stagewall" };

export default function JoinPage() {
  return (
    <LiveProvider>
      <div className="min-h-screen bg-gradient-to-b from-[#16142b] to-[#0b0c14]">
        <div className="mx-auto flex min-h-screen max-w-md flex-col">
          <FanApp />
          <p className="px-5 pb-6 text-center text-[11px] text-white/35">Synthetic demo data</p>
        </div>
      </div>
    </LiveProvider>
  );
}
