"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { MessageStatus } from "@/lib/policy";
import { formatDay, retentionDate, SHOW, TRACKS, trackColor } from "@/lib/show";
import type { FanView } from "@/lib/types";
import { ScrubbedText } from "./Badges";
import { useLive } from "./LiveProvider";

const STORE_KEY = "stagewall.mine.v1";
const NAME_MAX = 24;
const MESSAGE_MAX = 200;

interface Mine {
  token: string;
  id: string;
}

function loadMine(): Mine[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? (raw as Mine[]).filter((m) => m && typeof m.token === "string") : [];
  } catch {
    return [];
  }
}

function saveMine(list: Mine[]) {
  localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, 10)));
}

type View = "form" | "mine";

/** The fan's phone: write a message, then follow its status and delete it at any time. */
export function FanApp({ framed = false }: { framed?: boolean }) {
  const [mine, setMine] = useState<Mine[] | null>(null);
  const [view, setView] = useState<View>("form");

  useEffect(() => {
    const list = loadMine();
    // Reading localStorage has to wait for the client.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMine(list);
    if (list.length) setView("mine");
  }, []);

  const onSent = useCallback((m: Mine) => {
    setMine((prev) => {
      const next = [m, ...(prev ?? [])];
      saveMine(next);
      return next;
    });
    setView("mine");
  }, []);

  const onGone = useCallback((token: string) => {
    setMine((prev) => {
      const next = (prev ?? []).filter((m) => m.token !== token);
      saveMine(next);
      return next;
    });
  }, []);

  return (
    <div className={`flex h-full flex-col ${framed ? "" : "mx-auto max-w-md"}`}>
      <header className="px-5 pb-3 pt-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-300/80">Listening party</p>
        <h1 className="mt-1 text-[22px] font-semibold leading-tight text-white">{SHOW.album}</h1>
        <p className="text-[13px] text-white/55">
          {SHOW.artist} · {SHOW.city} · {SHOW.dateLabel}
        </p>
      </header>
      {mine !== null && mine.length > 0 && (
        <div className="mx-5 mb-3 grid grid-cols-2 rounded-lg bg-white/5 p-1 text-[13px] font-medium">
          <button
            type="button"
            onClick={() => setView("form")}
            className={`rounded-md py-1.5 transition ${view === "form" ? "bg-white/15 text-white" : "text-white/55"}`}
          >
            Write a message
          </button>
          <button
            type="button"
            onClick={() => setView("mine")}
            className={`rounded-md py-1.5 transition ${view === "mine" ? "bg-white/15 text-white" : "text-white/55"}`}
          >
            My messages ({mine.length})
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        {mine === null ? null : view === "form" ? (
          <SendForm onSent={onSent} />
        ) : (
          <div className="space-y-3" data-testid="my-messages">
            <AnimatePresence initial={false}>
              {mine.map((m) => (
                <StatusCard key={m.token} mine={m} onGone={onGone} />
              ))}
            </AnimatePresence>
            {mine.length === 0 && <p className="py-8 text-center text-sm text-white/50">Nothing here yet.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function SendForm({ onSent }: { onSent: (m: Mine) => void }) {
  const [name, setName] = useState("");
  const [track, setTrack] = useState("");
  const [message, setMessage] = useState("");
  const [display, setDisplay] = useState(false);
  const [recap, setRecap] = useState(false);
  const [website, setWebsite] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSend = name.trim() && track && message.trim() && display && !sending;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, track, message, displayConsent: display, recapConsent: recap, website }),
      });
      const data = (await res.json().catch(() => ({}))) as { token?: string; message?: FanView; error?: string };
      if (!res.ok || !data.token || !data.message) {
        setError(data.error ?? "Could not send. Check your connection and try again.");
        return;
      }
      onSent({ token: data.token, id: data.message.id });
      setMessage("");
      setDisplay(false);
      setRecap(false);
    } catch {
      setError("Could not send. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Send a message to the screen">
      <Field label="First name" count={`${name.length}/${NAME_MAX}`}>
        <input
          name="name"
          value={name}
          maxLength={NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          placeholder="Just your first name"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-[15px] text-white outline-none placeholder:text-white/30 focus:border-violet-400/60 focus:ring-2 focus:ring-violet-400/20"
        />
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-[12px] font-medium text-white/60">Your track tonight</legend>
        <div className="grid grid-cols-2 gap-2">
          {TRACKS.map((t) => {
            const on = track === t.title;
            return (
              <label
                key={t.id}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-[13px] transition ${
                  on ? "border-white/40 bg-white/10 text-white" : "border-white/10 bg-white/[0.03] text-white/70 hover:border-white/25"
                }`}
              >
                <input
                  type="radio"
                  name="track"
                  value={t.title}
                  checked={on}
                  onChange={() => setTrack(t.title)}
                  className="sr-only"
                />
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color }} aria-hidden />
                {t.title}
              </label>
            );
          })}
        </div>
      </fieldset>

      <Field label="Message" count={`${message.length}/${MESSAGE_MAX}`}>
        <textarea
          name="message"
          value={message}
          maxLength={MESSAGE_MAX}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder="What does this album mean to you?"
          className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-[15px] leading-snug text-white outline-none placeholder:text-white/30 focus:border-violet-400/60 focus:ring-2 focus:ring-violet-400/20"
        />
      </Field>

      {/* Honeypot: hidden from people, tempting to bots. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} name="website" />
        </label>
      </div>

      <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <Check checked={display} onChange={setDisplay} label="Show on the screen tonight" hint="Required. Your first name, track and message appear on the venue screen." />
        <Check checked={recap} onChange={setRecap} label="Use in the recap video" hint="Optional. Off unless you turn it on." />
      </div>

      <p className="text-[11.5px] leading-relaxed text-white/45">
        We remove phone numbers, emails, links, @handles and addresses before anyone sees your message. No email or IP is stored, and
        everything is deleted on {formatDay(retentionDate())}.
      </p>

      {error && (
        <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-[13px] text-rose-200 ring-1 ring-rose-400/30">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSend}
        className="w-full rounded-xl bg-violet-500 py-3 text-[15px] font-semibold text-white shadow-lg shadow-violet-500/20 transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40 disabled:shadow-none"
      >
        {sending ? "Sending..." : "Send"}
      </button>
    </form>
  );
}

function Field({ label, count, children }: { label: string; count: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-[12px] font-medium text-white/60">
        {label}
        <span className="tabular-nums text-white/35">{count}</span>
      </span>
      {children}
    </label>
  );
}

function Check({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4.5 w-4.5 shrink-0 accent-violet-500"
      />
      <span>
        <span className="block text-[14px] font-medium text-white">{label}</span>
        <span className="block text-[12px] text-white/50">{hint}</span>
      </span>
    </label>
  );
}

const STATUS_UI: Record<MessageStatus | "deleted", { label: string; detail: string; cls: string; dot: string }> = {
  screening: { label: "Screening", detail: "Checking it against the house rules.", cls: "text-sky-200 bg-sky-400/10 ring-sky-400/30", dot: "bg-sky-400 pulse-dot" },
  live: { label: "Live", detail: "It is on the venue screen now.", cls: "text-emerald-200 bg-emerald-400/10 ring-emerald-400/30", dot: "bg-emerald-400" },
  held: { label: "Waiting for a person", detail: "Someone on the team will look at it before it goes up.", cls: "text-amber-200 bg-amber-400/10 ring-amber-400/30", dot: "bg-amber-400 pulse-dot" },
  hidden: { label: "Not shown", detail: "This one will not go on the screen.", cls: "text-zinc-300 bg-white/5 ring-white/15", dot: "bg-zinc-400" },
  deleted: { label: "Deleted", detail: "Removed from every screen and from our database.", cls: "text-zinc-300 bg-white/5 ring-white/15", dot: "bg-zinc-500" },
};

const REMOVED_LABEL: Record<string, string> = {
  phone: "phone number",
  email: "email",
  link: "link",
  handle: "@handle",
  address: "address",
};

export function StatusCard({ mine, onGone }: { mine: Mine; onGone: (token: string) => void }) {
  const [view, setView] = useState<FanView | null>(null);
  const [status, setStatus] = useState<MessageStatus | "deleted" | null>(null);
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/manage/${mine.token}`, { cache: "no-store" });
    if (res.status === 404) {
      setMissing(true);
      return;
    }
    if (!res.ok) return;
    const data = (await res.json()) as { message: FanView };
    setView(data.message);
    setStatus(data.message.status);
  }, [mine.token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  useLive((e) => {
    if (e.type === "status" && e.id === mine.id) {
      setStatus(e.status);
      if (e.status !== "deleted") void refresh();
    }
  });

  async function remove() {
    setBusy(true);
    const res = await fetch(`/api/manage/${mine.token}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok || res.status === 404) setStatus("deleted");
  }

  if (missing) {
    return (
      <motion.div layout className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-[13px] text-white/50">
        This message is no longer stored.{" "}
        <button type="button" className="underline" onClick={() => onGone(mine.token)}>
          Clear
        </button>
      </motion.div>
    );
  }
  if (!view || !status) {
    return <div className="h-36 animate-pulse rounded-2xl bg-white/5" />;
  }
  const ui = STATUS_UI[status];
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      data-testid="status-card"
      className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]"
    >
      <div className="h-1" style={{ background: trackColor(view.track) }} />
      <div className="space-y-3 p-4">
        <div className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ${ui.cls}`} data-testid="status-pill">
          <span className={`h-1.5 w-1.5 rounded-full ${ui.dot}`} aria-hidden />
          {ui.label}
        </div>
        <p className="text-[12.5px] text-white/55">{ui.detail}</p>
        {status !== "deleted" && (
          <>
            <blockquote className="text-[15px] leading-snug text-white">
              <ScrubbedText text={view.body} />
            </blockquote>
            <p className="text-[12px] text-white/45">
              {view.name} · {view.track}
              {view.recapConsent ? " · recap use on" : " · recap use off"}
            </p>
            {view.removed.length > 0 && (
              <p className="rounded-lg bg-white/5 px-3 py-2 text-[12px] text-white/60">
                We removed your {view.removed.map((r) => REMOVED_LABEL[r] ?? r).join(", ")} before anyone saw it.
              </p>
            )}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="rounded-lg bg-white/10 px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-rose-500/80 disabled:opacity-50"
              >
                {busy ? "Deleting..." : "Delete my message"}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard?.writeText(`${window.location.origin}/m/${mine.token}`).catch(() => undefined);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="rounded-lg px-3 py-2 text-[13px] text-white/60 transition hover:bg-white/5 hover:text-white"
              >
                {copied ? "Copied" : "Copy private link"}
              </button>
            </div>
          </>
        )}
        {status === "deleted" && (
          <button type="button" className="text-[12px] text-white/50 underline" onClick={() => onGone(mine.token)}>
            Clear from this phone
          </button>
        )}
      </div>
    </motion.article>
  );
}
