import { subscribe, type LiveEvent } from "@/lib/bus";
import { ready } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One server-sent event stream per page carries every live update. */
export async function GET(req: Request) {
  ready();
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const unsubscribe = subscribe((e: LiveEvent) => write(`data: ${JSON.stringify(e)}\n\n`));
      const heartbeat = setInterval(() => write(": ping\n\n"), 15_000);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      req.signal.addEventListener("abort", () => cleanup(), { once: true });
      write("retry: 2000\n\n");
      write(`data: ${JSON.stringify({ type: "hello" })}\n\n`);
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
