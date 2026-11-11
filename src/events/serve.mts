import { parseEnvelope } from "./envelope.mts";
import { createSseParser } from "./sse.mts";
import type {
  EventDeps,
  EventEnvelope,
  EventTransport,
  OwnerScope,
  TransportResult,
} from "./types.mts";

const CONNECT_TIMEOUT_MS = 10_000;

/** hook-harness's own resume cursor: base64url JSON around the relay sort key. */
function resumeCursor(startMs: number): string {
  return Buffer.from(JSON.stringify({ v: 1, sk: String(startMs), seen: [] })).toString("base64url");
}

/**
 * Streams a local `hook-harness serve` over SSE. The stream feeds an in-memory buffer; `poll`
 * drains it, waiting up to `waitMs` for the first event. A dropped stream is reconnected on the
 * next poll from the last `id` seen, so a wait that finds it dead degrades rather than hangs.
 */
export function createServeTransport(
  config: { url: string; token: string },
  startMs: number,
  deps: Pick<EventDeps, "fetch">,
): EventTransport {
  const url = new URL("events", config.url.endsWith("/") ? config.url : `${config.url}/`);
  let lastId = resumeCursor(startMs);
  let controller: AbortController | undefined;
  let streamError: string | undefined;
  let gap = false;
  let buffer: EventEnvelope[] = [];
  let wake: (() => void) | undefined;

  const notify = (): void => {
    wake?.();
    wake = undefined;
  };

  async function read(body: ReadableStream<Uint8Array>, mine: AbortController): Promise<void> {
    const parse = createSseParser();
    const decoder = new TextDecoder();
    try {
      for await (const chunk of body) {
        if (controller !== mine) return;
        for (const message of parse(decoder.decode(chunk, { stream: true }))) {
          if (message.id) lastId = message.id;
          if (message.event === "gap") gap = true;
          const envelope =
            message.event === "envelope" ? parseEnvelope(safeJson(message.data)) : null;
          if (envelope) buffer.push(envelope);
        }
        notify();
      }
      if (controller === mine) streamError = "serve closed the stream";
    } catch (error) {
      if (controller === mine) {
        streamError = `serve stream failed (${error instanceof Error ? error.name : "error"})`;
      }
    }
    notify();
  }

  /** Open the stream; returns a failure reason, or undefined once connected. */
  async function connect(): Promise<{ reason: string; denied: boolean } | undefined> {
    const next = new AbortController();
    const timer = setTimeout(() => next.abort(), CONNECT_TIMEOUT_MS);
    try {
      const response = await deps.fetch(url, {
        headers: {
          accept: "text/event-stream",
          "last-event-id": lastId,
          ...(config.token && { authorization: `Bearer ${config.token}` }),
        },
        signal: next.signal,
      });
      if (response.status === 401 || response.status === 403) {
        return { reason: `serve answered HTTP ${response.status}`, denied: true };
      }
      if (!response.ok || !response.body) {
        return { reason: `serve answered HTTP ${response.status}`, denied: false };
      }
      controller = next;
      streamError = undefined;
      void read(response.body, next);
      return undefined;
    } catch (error) {
      next.abort();
      return {
        reason: `serve connection failed (${error instanceof Error ? error.name : "error"})`,
        denied: false,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    intervalMs: 0,
    async poll(scopes: OwnerScope[], waitMs): Promise<TransportResult> {
      if (controller === undefined || streamError !== undefined) {
        controller?.abort();
        controller = undefined;
        const failure = await connect();
        if (failure?.denied) {
          return {
            events: [],
            uncovered: scopes.map(({ owner }) => ({ owner, reason: failure.reason })),
          };
        }
        if (failure) return { events: [], unhealthy: failure.reason };
      }
      if (buffer.length === 0 && streamError === undefined) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => done(), waitMs);
          const done = (): void => {
            clearTimeout(timer);
            resolve();
          };
          wake = done;
        });
      }
      const events = buffer;
      buffer = [];
      const result: TransportResult = { events };
      if (gap) result.unhealthy = "serve reported a gap";
      else if (streamError) result.unhealthy = streamError;
      gap = false;
      return result;
    },
    close() {
      controller?.abort();
      controller = undefined;
    },
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
