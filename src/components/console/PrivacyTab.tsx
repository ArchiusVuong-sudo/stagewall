"use client";

import { useCallback, useEffect, useState } from "react";
import type { MessageStatus } from "@/lib/policy";
import { formatDay } from "@/lib/show";
import type { AuditEvent } from "@/lib/types";
import { useLive } from "../LiveProvider";

interface PrivacyData {
  audit: AuditEvent[];
  counts: Record<MessageStatus, number>;
  recapCount: number;
  retention: { date: string; days: number; showDate: string };
}

const STORED = [
  ["First name", "after scrubbing, max 24 characters"],
  ["Track pick", "one of six"],
  ["Message", "after scrubbing, max 200 characters"],
  ["Removal tags", "which kinds of detail were cut, not the detail"],
  ["Consent", "screen (required) and recap (optional, off by default)"],
  ["Status and verdict", "with the screener trace for moderators"],
  ["Manage link", "SHA-256 hash only, never the link itself"],
  ["Times", "sent, decided, auto-delete date"],
];

const NEVER = [
  ["Raw text", "names and messages are scrubbed in memory before any write"],
  ["IP address", "rate limits use a salted hash; the salt rotates daily and lives only in memory"],
  ["Email or phone", "not asked for; any typed into a message is removed"],
  ["Accounts, cookies, device ids", "none; the phone keeps its own link"],
  ["Third-party scripts", "the content policy allows this origin only"],
  ["Deleted messages", "hard delete; the log keeps the action, not the words"],
];

export function PrivacyTab() {
  const [data, setData] = useState<PrivacyData | null>(null);
  const [purgeNote, setPurgeNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/console/privacy", { cache: "no-store" });
    if (res.ok) setData((await res.json()) as PrivacyData);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useLive((e) => {
    if (e.type === "queue.changed" || e.type === "settings.changed") void load();
  });

  async function purge() {
    const res = await fetch("/api/console/purge", { method: "POST" });
    if (!res.ok) return setPurgeNote("Purge failed");
    const { removed } = (await res.json()) as { removed: number };
    setPurgeNote(
      removed
        ? `Removed ${removed} expired message${removed === 1 ? "" : "s"}.`
        : `Nothing has expired yet. Everything goes on ${data ? formatDay(new Date(data.retention.date)) : "the auto-delete date"}.`,
    );
    void load();
  }

  if (!data) return <div className="flex h-full items-center justify-center text-sm text-zinc-500">Loading...</div>;
  const total = data.counts.screening + data.counts.held + data.counts.live + data.counts.hidden;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto grid max-w-[1180px] grid-cols-[1fr_1fr_380px] gap-4 p-6">
        <Card title="Stored" subtitle={`${total} messages right now, all synthetic`}>
          <FieldList rows={STORED} tone="stored" />
        </Card>
        <Card title="Never stored" subtitle="Checked by a test that reads the database and WAL files">
          <FieldList rows={NEVER} tone="never" />
        </Card>
        <div className="space-y-4">
          <Card title="Auto-delete">
            <p className="text-[26px] font-semibold tracking-tight" data-testid="retention-date">
              {formatDay(new Date(data.retention.date))}
            </p>
            <p className="text-[12.5px] text-zinc-500">
              {data.retention.days} days after the show on {formatDay(new Date(`${data.retention.showDate}T00:00:00Z`))}. A purge runs every hour and
              on demand.
            </p>
            <button
              type="button"
              onClick={purge}
              className="mt-3 rounded-lg border border-zinc-300 px-3 py-1.5 text-[12.5px] font-semibold hover:bg-zinc-50"
            >
              Purge expired
            </button>
            {purgeNote && (
              <p className="mt-2 text-[12.5px] text-zinc-600" data-testid="purge-note">
                {purgeNote}
              </p>
            )}
          </Card>
          <Card title="Recap list">
            <p className="text-[12.5px] text-zinc-600">
              Only live messages whose fans ticked recap use. <b className="tabular-nums">{data.recapCount}</b> qualify now.
            </p>
            <a
              href="/api/console/export"
              className="mt-3 inline-block rounded-lg bg-zinc-900 px-3 py-1.5 text-[12.5px] font-semibold text-white"
              data-testid="export"
            >
              Export recap list (CSV)
            </a>
          </Card>
        </div>
        <div className="col-span-3">
          <Card title="Audit log" subtitle="Action, actor and time. No message text, no names, no ids.">
            <div className="max-h-[300px] overflow-y-auto">
              <table className="w-full text-left text-[12.5px]" data-testid="audit">
                <thead className="sticky top-0 bg-white text-[11px] uppercase tracking-wide text-zinc-400">
                  <tr>
                    <th className="py-1.5 font-semibold">Time</th>
                    <th className="py-1.5 font-semibold">Actor</th>
                    <th className="py-1.5 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.audit.map((a) => (
                    <tr key={a.id} className="border-t border-zinc-100">
                      <td className="py-1.5 font-mono text-[11.5px] text-zinc-500">{new Date(a.at).toLocaleTimeString("en-GB")}</td>
                      <td className="py-1.5">
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600">{a.actor}</span>
                      </td>
                      <td className="py-1.5 text-zinc-800">{a.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <h3 className="text-[13px] font-semibold">{title}</h3>
      {subtitle && <p className="mb-3 text-[12px] text-zinc-400">{subtitle}</p>}
      {!subtitle && <div className="mb-2" />}
      {children}
    </section>
  );
}

function FieldList({ rows, tone }: { rows: string[][]; tone: "stored" | "never" }) {
  return (
    <ul className="space-y-2">
      {rows.map(([k, v]) => (
        <li key={k} className="flex gap-2.5">
          <span
            className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
              tone === "stored" ? "bg-zinc-900 text-white" : "bg-rose-50 text-rose-600 ring-1 ring-rose-200"
            }`}
            aria-hidden
          >
            {tone === "stored" ? "✓" : "×"}
          </span>
          <span>
            <span className="block text-[13px] font-medium text-zinc-900">{k}</span>
            <span className="block text-[12px] text-zinc-500">{v}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
