import { EventEmitter } from "node:events";
import type { MessageStatus } from "./policy";
import type { PublicMessage } from "./types";

/** Everything pushed over the one SSE channel. No held or hidden text ever goes out here. */
export type LiveEvent =
  | { type: "wall.add"; message: PublicMessage }
  | { type: "wall.remove"; id: string }
  | { type: "status"; id: string; status: MessageStatus | "deleted" }
  | { type: "queue.changed" }
  | { type: "settings.changed" }
  | { type: "eval.progress"; screener: string; done: number; total: number }
  | { type: "eval.done" }
  | { type: "reset" };

const g = globalThis as typeof globalThis & { __stagewallBus?: EventEmitter };

/** In-process bus on globalThis so every route handler and dev reload shares one. */
function bus(): EventEmitter {
  if (!g.__stagewallBus) {
    g.__stagewallBus = new EventEmitter();
    g.__stagewallBus.setMaxListeners(0);
  }
  return g.__stagewallBus;
}

export function publish(event: LiveEvent): void {
  bus().emit("event", event);
}

export function subscribe(fn: (event: LiveEvent) => void): () => void {
  bus().on("event", fn);
  return () => bus().off("event", fn);
}
