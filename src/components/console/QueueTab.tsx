"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { countWouldPublish, type MessageStatus } from "@/lib/policy";
import { trackColor } from "@/lib/show";
import type { ModeInfo } from "@/lib/status-info";
import type { MessageRecord, Settings } from "@/lib/types";
import { ScrubbedText } from "../Badges";
import { useLive } from "../LiveProvider";
import { TraceDrawer } from "./TraceDrawer";

interface QueueData {
  messages: MessageRecord[];
  settings: Settings;
  counts: Record<MessageStatus, number>;
  mode: ModeInfo;
}

type Decided = Exclude<MessageStatus, "screening">;

interface Toast {
  key: number;
  text: string;
  tone: "ok" | "error";
}

const COLUMNS: Array<{ key: string; title: string; hint: string; statuses: MessageStatus[] }> = [
  { key: "review", title: "Needs review", hint: "Held by the policy, or still screening", statuses: ["screening", "held"] },
  { key: "live", title: "Live", hint: "On every screen now", statuses: ["live"] },
  { key: "hidden", title: "Not shown", hint: "Rejected by the policy or a producer", statuses: ["hidden"] },
];

export function QueueTab() {
  const [data, setData] = useState<QueueData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const undo = useRef<Array<{ id: string; previous: Decided; name: string }>>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/console/queue", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as QueueData);
      setError(null);
    } catch {
      setError("Could not load the queue. Retrying when the next update arrives.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  useLive((e) => {
    if (e.type === "queue.changed" || e.type === "settings.changed") {
      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(() => void load(), 80);
    }
  });

  const columns = useMemo(
    () =>
      COLUMNS.map((c) => ({
        ...c,
        items: (data?.messages ?? [])
          .filter((m) => c.statuses.includes(m.status))
          .sort((a, b) => (a.status === "screening" ? -1 : 0) - (b.status === "screening" ? -1 : 0)),
      })),
    [data],
  );
  const flat = useMemo(() => columns.flatMap((c) => c.items), [columns]);

  const showToast = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ key: Date.now(), text, tone });
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const decide = useCallback(
    async (m: MessageRecord, action: "approve" | "reject") => {
      if (m.status === "screening") return showToast("Still screening. Give it a moment.", "error");
      const target: Decided = action === "approve" ? "live" : "hidden";
      if (m.status === target) return;
      const res = await fetch("/api/console/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id, action }),
      });
      const body = (await res.json().catch(() => ({}))) as { previous?: Decided; error?: string };
      if (!res.ok) return showToast(body.error ?? "That did not work", "error");
      undo.current.push({ id: m.id, previous: body.previous ?? (m.status as Decided), name: m.name });
      showToast(`${action === "approve" ? "Approved" : "Rejected"} ${m.name}'s message. Press Z to undo.`);
      // Move to the next card so a moderator can keep going.
      const i = flat.findIndex((x) => x.id === m.id);
      const next = flat[i + 1] ?? flat[i - 1];
      if (next) setSelected(next.id);
      void load();
    },
    [flat, load, showToast],
  );

  const undoLast = useCallback(async () => {
    const last = undo.current.pop();
    if (!last) return showToast("Nothing to undo", "error");
    const res = await fetch("/api/console/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: last.id, action: "restore", to: last.previous }),
    });
    if (!res.ok) return showToast("Could not undo (the fan may have deleted it)", "error");
    setSelected(last.id);
    showToast(`Undone. ${last.name}'s message is back to ${labelFor(last.previous)}.`);
    void load();
  }, [load, showToast]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      const i = flat.findIndex((m) => m.id === selected);
      const current = i >= 0 ? flat[i] : undefined;
      if (key === "j" || key === "arrowdown") {
        e.preventDefault();
        const next = flat[Math.min(flat.length - 1, i + 1)] ?? flat[0];
        if (next) setSelected(next.id);
      } else if (key === "k" || key === "arrowup") {
        e.preventDefault();
        const prev = flat[Math.max(0, i - 1)] ?? flat[0];
        if (prev) setSelected(prev.id);
      } else if (key === "a" && current) {
        void decide(current, "approve");
      } else if (key === "r" && current) {
        void decide(current, "reject");
      } else if (key === "z") {
        void undoLast();
      } else if ((key === "enter" || key === "t") && current) {
        setTraceId(current.id);
      } else if (key === "escape") {
        setTraceId(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flat, selected, decide, undoLast]);

  useEffect(() => {
    if (!selected) return;
    document.querySelector(`[data-card="${selected}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
        {error ?? <span className="animate-pulse">Loading the queue...</span>}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <SettingsPanel data={data} onSaved={load} showToast={showToast} />
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-4 p-5">
        {columns.map((c) => (
          <section key={c.key} className="flex min-h-0 flex-col rounded-xl border border-zinc-200 bg-white" data-testid={`col-${c.key}`}>
            <header className="flex items-baseline justify-between border-b border-zinc-100 px-4 py-3">
              <div>
                <h2 className="text-[13px] font-semibold text-zinc-900">{c.title}</h2>
                <p className="text-[11.5px] text-zinc-400">{c.hint}</p>
              </div>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[12px] font-semibold tabular-nums text-zinc-600">{c.items.length}</span>
            </header>
            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
              <AnimatePresence initial={false}>
                {c.items.map((m) => (
                  <QueueCard
                    key={m.id}
                    m={m}
                    selected={m.id === selected}
                    onClick={() => {
                      setSelected(m.id);
                      setTraceId(m.id);
                    }}
                  />
                ))}
              </AnimatePresence>
              {c.items.length === 0 && (
                <p className="py-10 text-center text-[12.5px] text-zinc-400">{c.key === "review" ? "All clear. Nothing waits for a person." : "Empty"}</p>
              )}
            </div>
          </section>
        ))}
      </div>
      <AnimatePresence>{traceId && <TraceDrawer key={traceId} id={traceId} onClose={() => setTraceId(null)} />}</AnimatePresence>
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            role="status"
            data-testid="toast"
            className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl px-4 py-2.5 text-[13px] font-medium shadow-xl ${
              toast.tone === "ok" ? "bg-zinc-900 text-white" : "bg-rose-600 text-white"
            }`}
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function labelFor(s: MessageStatus): string {
  return s === "live" ? "Live" : s === "hidden" ? "Not shown" : s === "held" ? "Needs review" : "Screening";
}

const DECISION_CHIP: Record<string, string> = {
  approve: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  review: "bg-amber-50 text-amber-800 ring-amber-200",
  reject: "bg-rose-50 text-rose-700 ring-rose-200",
};

function QueueCard({ m, selected, onClick }: { m: MessageRecord; selected: boolean; onClick: () => void }) {
  const v = m.verdict;
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.18 }}
      data-card={m.id}
      data-testid="queue-card"
      data-status={m.status}
      onClick={onClick}
      className={`cursor-pointer rounded-lg border bg-white p-3 transition-shadow ${
        selected ? "border-zinc-900 shadow-[0_0_0_3px_rgba(24,24,27,0.08)]" : "border-zinc-200 hover:border-zinc-300"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: trackColor(m.track) }} aria-hidden />
        <span className="text-[13px] font-semibold text-zinc-900">{m.name}</span>
        <span className="truncate text-[12px] text-zinc-400">{m.track}</span>
        <span className="ml-auto flex items-center gap-1.5">
          {m.status === "screening" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 ring-1 ring-sky-200">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-sky-500" />
              Screening
            </span>
          ) : v ? (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${DECISION_CHIP[v.decision]}`}>
              {v.decision} {v.confidence.toFixed(2)}
            </span>
          ) : m.decidedBy === "seed" ? (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500">seed</span>
          ) : (
            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200">no verdict</span>
          )}
        </span>
      </div>
      <p className="mt-2 text-[13.5px] leading-snug text-zinc-800">
        <ScrubbedText text={m.body} tone="light" />
      </p>
      {v && v.reasons.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[12px] leading-snug text-zinc-500">
          {v.reasons.slice(0, 2).map((r, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-zinc-300">-</span>
              {r}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[10.5px] font-medium">
        {v?.categories
          .filter((c) => c !== "fan_love")
          .map((c) => (
            <span key={c} className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-600">
              {c.replace(/_/g, " ")}
            </span>
          ))}
        {m.removed.map((r) => (
          <span key={r} className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800 ring-1 ring-amber-200">
            {r} removed
          </span>
        ))}
        <span className="rounded bg-zinc-50 px-1.5 py-0.5 text-zinc-500 ring-1 ring-zinc-200">screen: yes</span>
        <span className={`rounded px-1.5 py-0.5 ring-1 ${m.recapConsent ? "bg-violet-50 text-violet-700 ring-violet-200" : "bg-zinc-50 text-zinc-400 ring-zinc-200"}`}>
          recap: {m.recapConsent ? "yes" : "no"}
        </span>
        {m.decidedBy === "producer" && <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-white">by producer</span>}
        {m.screener && m.decidedBy !== "seed" && <span className="ml-auto text-zinc-400">{m.screener}</span>}
      </div>
    </motion.article>
  );
}

function SettingsPanel({
  data,
  onSaved,
  showToast,
}: {
  data: QueueData;
  onSaved: () => Promise<void> | void;
  showToast: (t: string, tone?: "ok" | "error") => void;
}) {
  const saved = data.settings.threshold;
  const [threshold, setThreshold] = useState(saved);
  const [rulesText, setRulesText] = useState(data.settings.houseRules.join("\n"));
  const [savingRules, setSavingRules] = useState(false);
  const savedRules = data.settings.houseRules.join("\n");

  useEffect(() => {
    // Follow saves from other tabs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThreshold(saved);
  }, [saved]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRulesText(savedRules);
  }, [savedRules]);

  const held = data.messages.filter((m) => m.status === "held");
  const wouldPublish = countWouldPublish(held, threshold);
  const atSaved = countWouldPublish(held, saved);

  async function saveThreshold() {
    const res = await fetch("/api/console/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threshold }),
    });
    if (res.ok) {
      showToast(`Auto-publish bar saved at ${threshold.toFixed(2)}. New messages use it.`);
      void onSaved();
    } else showToast("Could not save the bar", "error");
  }

  async function saveRules() {
    setSavingRules(true);
    const rules = rulesText
      .split("\n")
      .map((r) => r.trim())
      .filter(Boolean);
    const res = await fetch("/api/console/rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules }),
    });
    setSavingRules(false);
    if (res.ok) {
      const body = (await res.json()) as { settings: Settings };
      showToast(`House rules saved as v${body.settings.rulesVersion}. The next screening uses them.`);
      void onSaved();
    } else showToast("Rules need 1 to 12 lines of up to 160 characters", "error");
  }

  return (
    <aside className="flex w-[300px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-zinc-200 bg-white p-5">
      <div className="grid grid-cols-4 gap-1.5 text-center">
        {(
          [
            ["Screening", data.counts.screening],
            ["Review", data.counts.held],
            ["Live", data.counts.live],
            ["Hidden", data.counts.hidden],
          ] as const
        ).map(([label, n]) => (
          <div key={label} className="rounded-lg bg-zinc-50 py-2 ring-1 ring-zinc-100">
            <div className="text-[16px] font-semibold tabular-nums text-zinc-900">{n}</div>
            <div className="text-[10.5px] text-zinc-500">{label}</div>
          </div>
        ))}
      </div>

      <section>
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500">Auto-publish bar</h3>
        <p className="mt-1 text-[12px] leading-snug text-zinc-500">Approvals at or above this confidence go live without a person.</p>
        <div className="mt-3 flex items-center gap-3">
          <input
            type="range"
            min={0.5}
            max={0.99}
            step={0.01}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            aria-label="Auto-publish threshold"
            data-testid="threshold"
            className="flex-1 accent-zinc-900"
          />
          <span className="w-10 text-right font-mono text-[13px] font-semibold tabular-nums">{threshold.toFixed(2)}</span>
        </div>
        <p className="mt-2 rounded-lg bg-zinc-50 px-3 py-2 text-[12.5px] text-zinc-700 ring-1 ring-zinc-100" data-testid="would-publish">
          At {threshold.toFixed(2)}, <b className="tabular-nums">{wouldPublish}</b> of {held.length} held message{held.length === 1 ? "" : "s"} would publish
          {threshold !== saved && <span className="text-zinc-400"> (now {atSaved})</span>}
        </p>
        {threshold !== saved && (
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={saveThreshold} className="rounded-md bg-zinc-900 px-3 py-1.5 text-[12px] font-semibold text-white">
              Save
            </button>
            <button type="button" onClick={() => setThreshold(saved)} className="rounded-md px-3 py-1.5 text-[12px] text-zinc-600 hover:bg-zinc-100">
              Back to {saved.toFixed(2)}
            </button>
          </div>
        )}
      </section>

      <section>
        <div className="flex items-baseline justify-between">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500">House rules</h3>
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-600">v{data.settings.rulesVersion}</span>
        </div>
        <p className="mt-1 text-[12px] leading-snug text-zinc-500">One rule per line, in plain words. The screener reads them on every message.</p>
        <textarea
          value={rulesText}
          onChange={(e) => setRulesText(e.target.value)}
          rows={6}
          aria-label="House rules"
          data-testid="house-rules"
          className="mt-2 w-full resize-none rounded-lg border border-zinc-200 px-3 py-2 text-[12.5px] leading-relaxed outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
        />
        <button
          type="button"
          onClick={saveRules}
          disabled={savingRules || rulesText === savedRules}
          className="mt-1 rounded-md bg-zinc-900 px-3 py-1.5 text-[12px] font-semibold text-white disabled:bg-zinc-200 disabled:text-zinc-400"
        >
          {savingRules ? "Saving..." : "Save rules"}
        </button>
      </section>

      <section className="mt-auto">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500">Keys</h3>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[12px] text-zinc-600">
          {[
            ["J / K", "Next / previous card"],
            ["A", "Approve, goes live"],
            ["R", "Reject, not shown"],
            ["Z", "Undo the last decision"],
            ["Enter", "Open the trace"],
            ["Esc", "Close the trace"],
          ].map(([k, d]) => (
            <div key={k} className="contents">
              <dt>
                <kbd className="rounded border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 text-[11px] text-zinc-700 shadow-[0_1px_0_#d4d4d8]">{k}</kbd>
              </dt>
              <dd>{d}</dd>
            </div>
          ))}
        </dl>
      </section>
    </aside>
  );
}
