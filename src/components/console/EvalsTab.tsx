"use client";

import { useCallback, useEffect, useState } from "react";
import type { ModeInfo } from "@/lib/status-info";
import type { EvalRun } from "@/lib/types";
import { useLive } from "../LiveProvider";

interface EvalData {
  runs: EvalRun[];
  running: boolean;
  cases: number;
  mode: ModeInfo;
}

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "-");

/** The AI screener against a plain keyword filter on the labelled synthetic set. */
export function EvalsTab() {
  const [data, setData] = useState<EvalData | null>(null);
  const [progress, setProgress] = useState<Record<string, { done: number; total: number }>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/console/evals", { cache: "no-store" });
    if (res.ok) setData((await res.json()) as EvalData);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useLive((e) => {
    if (e.type === "eval.progress") setProgress((p) => ({ ...p, [e.screener]: { done: e.done, total: e.total } }));
    if (e.type === "eval.done") {
      setProgress({});
      void load();
    }
  });

  async function run() {
    setError(null);
    const res = await fetch("/api/console/evals", { method: "POST" });
    if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not start");
    else setData((d) => (d ? { ...d, running: true } : d));
  }

  if (!data) return <div className="flex h-full items-center justify-center text-sm text-zinc-500">Loading evals...</div>;
  const running = data.running || Object.keys(progress).length > 0;
  const runs = [...data.runs].sort((a, b) => (a.screener.startsWith("AI") ? -1 : 1) - (b.screener.startsWith("AI") ? -1 : 1));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1180px] space-y-5 p-6">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-[18px] font-semibold">Screener evals</h2>
            <p className="mt-1 max-w-2xl text-[13px] text-zinc-500">
              {data.cases} labelled synthetic cases in 7 languages: fan love, idiom traps, resale spam, harassment of another fan, mild hate, a
              sexual request, a house-rule spoiler, prompt injection and personal details the scrubber cannot catch. Each case runs through the
              same scrub, screener and policy (bar 0.85) as a real message. A miss is a case that went live when it should not, or the other way
              round.
            </p>
          </div>
          <button
            type="button"
            onClick={run}
            disabled={running}
            data-testid="run-eval"
            className="shrink-0 rounded-lg bg-zinc-900 px-4 py-2 text-[13px] font-semibold text-white disabled:bg-zinc-300"
          >
            {running ? "Running..." : "Run eval"}
          </button>
        </div>
        {data.mode.mode === "replay" && (
          <p className="rounded-lg bg-sky-50 px-3 py-2 text-[12.5px] text-sky-800 ring-1 ring-sky-200">
            Replay mode: a new AI run replays the verdicts recorded from a real live run, so its numbers match that run.
          </p>
        )}
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700 ring-1 ring-rose-200">{error}</p>}
        {Object.entries(progress).map(([name, p]) => (
          <div key={name} className="rounded-lg bg-white p-3 ring-1 ring-zinc-200">
            <div className="flex justify-between text-[12px] text-zinc-600">
              <span>{name}</span>
              <span className="tabular-nums">
                {p.done}/{p.total}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded bg-zinc-100">
              <div className="h-full bg-zinc-900 transition-all" style={{ width: `${(p.done / p.total) * 100}%` }} />
            </div>
          </div>
        ))}

        {runs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 py-12 text-center text-[13px] text-zinc-500">
            No eval runs yet. Press Run eval.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <table className="w-full text-left text-[13px]" data-testid="eval-table">
              <thead className="bg-zinc-50 text-[11.5px] uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Screener</th>
                  <th className="px-4 py-2.5 font-semibold">Model</th>
                  <th className="px-4 py-2.5 font-semibold">Run</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Accuracy</th>
                  <th className="px-4 py-2.5 text-right font-semibold">False approvals</th>
                  <th className="px-4 py-2.5 text-right font-semibold">False holds</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Time</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Cost</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-zinc-100">
                    <td className="px-4 py-3 font-semibold">{r.screener}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-zinc-600">{r.model ?? "none"}</td>
                    <td className="px-4 py-3 text-zinc-500">{new Date(r.startedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {pct(r.correct, r.total)} <span className="font-normal text-zinc-400">({r.correct}/{r.total})</span>
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums ${r.falseApprovals ? "font-semibold text-rose-600" : "text-zinc-500"}`}>{r.falseApprovals}</td>
                    <td className={`px-4 py-3 text-right tabular-nums ${r.falseHolds ? "font-semibold text-amber-700" : "text-zinc-500"}`}>{r.falseHolds}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-500">{(r.durationMs / 1000).toFixed(1)} s</td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-500">${r.costUsd.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {runs.map((r) => {
            const misses = r.results.filter((x) => x.got !== x.expected);
            return (
              <section key={r.id} className="rounded-xl border border-zinc-200 bg-white" data-testid="misses">
                <header className="flex items-baseline justify-between border-b border-zinc-100 px-4 py-3">
                  <h3 className="text-[13px] font-semibold">Misses: {r.screener}</h3>
                  <span className="text-[12px] text-zinc-400">{misses.length}</span>
                </header>
                <ul className="divide-y divide-zinc-100">
                  {misses.length === 0 && <li className="px-4 py-6 text-center text-[12.5px] text-zinc-400">No misses</li>}
                  {misses.map((x) => (
                    <li key={x.id} className="px-4 py-3">
                      <div className="flex items-center gap-2 text-[11px]">
                        <span
                          className={`rounded px-1.5 py-0.5 font-semibold ${
                            x.expected === "not_live" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"
                          }`}
                        >
                          {x.expected === "not_live" ? "false approval" : "false hold"}
                        </span>
                        <span className="text-zinc-500">{x.category}</span>
                        <span className="ml-auto font-mono text-zinc-400">
                          {x.id} · {x.lang}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[13px] leading-snug text-zinc-800">{x.message}</p>
                      <p className="mt-1 text-[12px] text-zinc-500">
                        {x.decision ? `${x.decision} ${x.confidence?.toFixed(2)}: ` : ""}
                        {x.error ?? x.reasons.join(" ")}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
