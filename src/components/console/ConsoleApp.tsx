"use client";

import { useState } from "react";
import type { ModeInfo } from "@/lib/status-info";
import { EvalsTab } from "./EvalsTab";
import { PrivacyTab } from "./PrivacyTab";
import { QueueTab } from "./QueueTab";

const TABS = ["Queue", "Evals", "Privacy"] as const;
type Tab = (typeof TABS)[number];

export function ConsoleApp({ mode }: { mode: ModeInfo }) {
  const [tab, setTab] = useState<Tab>("Queue");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-zinc-200 bg-white px-6" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`relative h-full px-3 text-[13px] font-medium transition-colors ${
              tab === t ? "text-zinc-900" : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {t}
            {tab === t && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-zinc-900" />}
          </button>
        ))}
        <span className="ml-auto text-[12px] text-zinc-400">
          Screener: {mode.mode === "live" ? `live Agent SDK (${mode.model})` : mode.mode === "replay" ? "replay of recorded live runs" : "offline keyword rules"}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        {tab === "Queue" && <QueueTab />}
        {tab === "Evals" && <EvalsTab />}
        {tab === "Privacy" && <PrivacyTab />}
      </div>
    </div>
  );
}
