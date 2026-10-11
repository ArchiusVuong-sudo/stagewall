"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import type { MessageRecord, TraceRecord } from "@/lib/types";
import { ScrubbedText } from "../Badges";

interface TraceData {
  message: MessageRecord;
  trace: TraceRecord | null;
}

/** Everything behind one AI decision: what it saw, what it answered, what the policy did. */
export function TraceDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const [data, setData] = useState<TraceData | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/console/trace/${id}`, { cache: "no-store" })
      .then(async (res) => {
        if (!alive) return;
        if (!res.ok) return setMissing(true);
        setData((await res.json()) as TraceData);
      })
      .catch(() => alive && setMissing(true));
    return () => {
      alive = false;
    };
  }, [id]);

  const t = data?.trace;
  return (
    <motion.aside
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 40, opacity: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 34 }}
      className="fixed bottom-0 right-0 top-[104px] z-40 flex w-[440px] flex-col border-l border-zinc-200 bg-white shadow-2xl shadow-zinc-900/10"
      data-testid="trace"
      aria-label="Decision trace"
    >
      <header className="flex items-center justify-between border-b border-zinc-100 px-5 py-3.5">
        <div>
          <h2 className="text-[14px] font-semibold">Decision trace</h2>
          <p className="text-[11.5px] text-zinc-400">{data ? `${data.message.name} · ${data.message.track}` : " "}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-[12px] text-zinc-500 hover:bg-zinc-100" aria-label="Close trace">
          Esc
        </button>
      </header>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4 text-[12.5px]">
        {missing && <p className="text-zinc-500">This message is gone. The fan deleted it or it was purged.</p>}
        {!data && !missing && <div className="h-40 animate-pulse rounded-lg bg-zinc-100" />}
        {data && !t && (
          <p className="rounded-lg bg-zinc-50 p-3 text-zinc-600 ring-1 ring-zinc-100">
            {data.message.decidedBy === "seed"
              ? "Seeded on the screen before the show. It never went through the screener, so there is no trace."
              : "Still screening. The trace appears when the verdict lands."}
          </p>
        )}
        {data && t && (
          <>
            <Section title="1. Input the screener saw (after scrubbing)">
              <div className="rounded-lg bg-zinc-50 p-3 ring-1 ring-zinc-100">
                <p className="text-[13px] leading-snug text-zinc-800">
                  <ScrubbedText text={t.input.message} tone="light" />
                </p>
                <p className="mt-1.5 text-zinc-500">
                  name: {t.input.name} · track: {t.input.track}
                </p>
              </div>
              <p className="mt-2 text-zinc-500">
                House rules v{t.rulesVersion}: {t.input.houseRules.length ? t.input.houseRules.join(" / ") : "none"}
              </p>
            </Section>

            <Section title="2. Tool call: record_verdict">
              <pre className="whitespace-pre-wrap break-words rounded-lg bg-zinc-950 p-3 font-mono text-[11.5px] leading-relaxed text-zinc-100" data-testid="tool-args">
                {t.toolArgs ? JSON.stringify(t.toolArgs, null, 2) : "(no tool call)"}
              </pre>
              {t.error && <p className="mt-2 rounded-lg bg-rose-50 p-2.5 text-rose-700 ring-1 ring-rose-200">Error: {t.error}</p>}
            </Section>

            <Section title="3. Run">
              <dl className="grid grid-cols-2 gap-2">
                <Stat label="Screener" value={t.screener} />
                <Stat label="Model" value={t.model ?? "none (rules)"} />
                <Stat label="Latency" value={`${(t.latencyMs / 1000).toFixed(2)} s`} />
                <Stat label="Tokens in / out" value={`${t.inputTokens.toLocaleString()} / ${t.outputTokens.toLocaleString()}`} />
                <Stat label="Cost (SDK estimate)" value={`$${t.costUsd.toFixed(4)}`} />
                <Stat label="When" value={new Date(t.createdAt).toLocaleTimeString("en-GB")} />
              </dl>
            </Section>

            <Section title="4. Policy">
              <div className="rounded-lg p-3 ring-1 ring-zinc-200">
                <p className="font-semibold text-zinc-900" data-testid="policy-result">
                  {t.policyStatus === "live" ? "Published" : t.policyStatus === "hidden" ? "Hidden" : "Held for a person"}
                </p>
                <p className="mt-0.5 text-zinc-600">{t.policyRule}</p>
                <p className="mt-1.5 text-zinc-400">Auto-publish bar {t.threshold.toFixed(2)}, hide bar 0.90</p>
              </div>
              {data.message.decidedBy === "producer" && (
                <p className="mt-2 rounded-lg bg-zinc-900 px-3 py-2 text-white">
                  A producer then set it to {data.message.status === "live" ? "Live" : data.message.status === "hidden" ? "Not shown" : "Needs review"}.
                </p>
              )}
            </Section>
          </>
        )}
      </div>
    </motion.aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{title}</h3>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-50 px-3 py-2 ring-1 ring-zinc-100">
      <dt className="text-[10.5px] text-zinc-400">{label}</dt>
      <dd className="mt-0.5 truncate font-medium text-zinc-800">{value}</dd>
    </div>
  );
}
