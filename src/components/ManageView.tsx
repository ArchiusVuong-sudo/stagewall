"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SHOW } from "@/lib/show";
import { StatusCard } from "./FanApp";

/** The private manage link: follow the status, delete at any time. */
export function ManageView({ token }: { token: string }) {
  const [id, setId] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "found" | "missing">("loading");

  useEffect(() => {
    let alive = true;
    fetch(`/api/manage/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (res) => {
        if (!alive) return;
        if (!res.ok) return setState("missing");
        const data = (await res.json()) as { message: { id: string } };
        setId(data.message.id);
        setState("found");
      })
      .catch(() => alive && setState("missing"));
    return () => {
      alive = false;
    };
  }, [token]);

  return (
    <div className="mx-auto max-w-md px-5 py-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-300/80">Your message</p>
      <h1 className="mt-1 text-[22px] font-semibold text-white">{SHOW.album}</h1>
      <p className="mb-5 text-[13px] text-white/55">This private link is the only way to manage it. We keep only a hash of it.</p>
      {state === "loading" && <div className="h-36 animate-pulse rounded-2xl bg-white/5" />}
      {state === "missing" && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-[14px] text-white/70">
          No message is stored for this link. It may have been deleted, or removed after the show.
          <Link href="/join" className="mt-3 block font-semibold text-violet-300">
            Send a new message
          </Link>
        </div>
      )}
      {state === "found" && id && <StatusCard mine={{ token, id }} onGone={() => setState("missing")} />}
      <p className="mt-8 text-center text-[11px] text-white/35">Synthetic demo data</p>
    </div>
  );
}
