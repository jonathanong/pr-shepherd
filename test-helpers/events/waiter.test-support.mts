import { vi } from "vitest";
import type {
  EventEnvelope,
  EventTransport,
  OwnerScope,
  TransportResult,
  WatchTarget,
} from "../../src/events/types.mts";
import { createEventWaiter, MIN_TICK_GAP_MS } from "../../src/events/waiter.mts";

export const target: WatchTarget = { repo: "acme/widgets", pr: 7, baseRef: "main" };
export const hit: EventEnvelope = {
  id: "hit",
  event: "check_suite",
  action: "completed",
  repo: "acme/widgets",
  prs: [7],
  headSha: null,
  headRef: null,
  baseRef: null,
};
export const miss = (id: string): EventEnvelope => ({ ...hit, id, prs: [99] });

/** A virtual clock: sleeping advances time, and so does a blocking transport's wait. */
type WaitRequest = Parameters<ReturnType<typeof createEventWaiter>["wait"]>[0];

export function harness(
  script: Array<TransportResult | ((scopes: OwnerScope[], waitMs: number) => TransportResult)>,
  { intervalMs = 15_000, fallbackMs = 300_000 } = {},
) {
  let clock = 1_000_000;
  const notes: string[] = [];
  const polls: Array<{ at: number; scopes: OwnerScope[]; waitMs: number }> = [];
  const transport: EventTransport = {
    intervalMs,
    async poll(scopes, waitMs) {
      polls.push({ at: clock, scopes, waitMs });
      const next = script.length > 1 ? script.shift()! : script[0]!;
      if (intervalMs === 0) clock += waitMs;
      return typeof next === "function" ? next(scopes, waitMs) : next;
    },
    close: vi.fn(),
  };
  const waiter = createEventWaiter({
    transport,
    fallbackMs,
    deps: {
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    },
    note: (message) => notes.push(message),
  });
  const request = (overrides: Partial<WaitRequest> = {}): WaitRequest => ({
    targets: [target],
    sleepMs: 60_000,
    windowMs: Infinity,
    recheck: false,
    minGapMs: MIN_TICK_GAP_MS,
    tickStartedAt: clock,
    ...overrides,
  });
  return { waiter, transport, notes, polls, request, now: () => clock };
}
