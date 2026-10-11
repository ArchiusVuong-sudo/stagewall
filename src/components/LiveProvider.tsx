"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { LiveEvent } from "@/lib/bus";

type Listener = (e: LiveEvent) => void;

interface LiveContext {
  subscribe: (fn: Listener) => () => void;
  connected: boolean;
}

const Ctx = createContext<LiveContext | null>(null);

/** One EventSource per page, shared by every component on it. */
export function LiveProvider({ children }: { children: ReactNode }) {
  const listeners = useRef(new Set<Listener>());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const es = new EventSource("/api/events");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (m) => {
      let e: LiveEvent;
      try {
        e = JSON.parse(m.data) as LiveEvent;
      } catch {
        return;
      }
      if (e.type === "reset") {
        window.location.reload();
        return;
      }
      for (const fn of listeners.current) fn(e);
    };
    return () => es.close();
  }, []);

  const subscribe = useCallback((fn: Listener) => {
    const set = listeners.current;
    set.add(fn);
    return () => {
      set.delete(fn);
    };
  }, []);
  const value = useMemo(() => ({ subscribe, connected }), [subscribe, connected]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLive(fn: Listener) {
  const ctx = useContext(Ctx);
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  const subscribe = ctx?.subscribe;
  useEffect(() => {
    if (!subscribe) return;
    return subscribe((e) => ref.current(e));
  }, [subscribe]);
}

export function useLiveConnected(): boolean {
  return useContext(Ctx)?.connected ?? false;
}
