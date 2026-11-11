import { createHealth, ownerOf } from "./health.mts";
import { filtersFor } from "./filters.mts";
import { matchesAny } from "./matcher.mts";
import type {
  EventDeps,
  EventEnvelope,
  EventTransport,
  OwnerScope,
  WatchTarget,
} from "./types.mts";

/** After the first matching event, wait this long so a burst becomes one tick. */
const SETTLE_MS = 10_000;
/** Earliest next tick after the previous one started, absent a larger quota-band floor. */
export const MIN_TICK_GAP_MS = 15_000;
const SEEN_LIMIT = 2000;

interface WaitRequest {
  targets: readonly WatchTarget[];
  /** The plain sleep: `poll.interval-seconds` raised by any quota band. */
  sleepMs: number;
  /** Time left in the poll window; `Infinity` for `--until-terminal`. */
  windowMs: number;
  /** GitHub is still recomputing mergeability: keep the plain recheck cadence. */
  recheck: boolean;
  /** Earliest gap after `tickStartedAt` before the next tick may start. */
  minGapMs: number;
  tickStartedAt: number;
}

export type Wake = { kind: "event"; event: EventEnvelope } | { kind: "timer" };

interface WaitOutcome {
  wake: Wake;
  /** The source was lost during this wait, so the plain deadline applied. */
  degraded: boolean;
}

export interface EventWaiter {
  /** False once an owner is known uncovered: the caller keeps today's plain polling. */
  engaged(targets: readonly WatchTarget[]): boolean;
  wait(request: WaitRequest): Promise<WaitOutcome>;
  close(): void;
}

function scopesOf(targets: readonly WatchTarget[]): OwnerScope[] {
  const byOwner = new Map<string, WatchTarget[]>();
  for (const target of targets) {
    const owner = ownerOf(target.repo);
    byOwner.set(owner, [...(byOwner.get(owner) ?? []), target]);
  }
  return [...byOwner].map(([owner, owned]) => ({
    owner,
    repos: [...new Set(owned.map((target) => target.repo.toLowerCase()))],
    filters: filtersFor(owned),
  }));
}

/**
 * Wait for an event that matches a watched PR, or a deadline. The healthy deadline is the
 * fallback interval; once the source fails the plain `sleepMs` applies from the start of the wait.
 * Events are wake signals only: the caller always runs a full tick afterwards.
 */
export function createEventWaiter(options: {
  transport: EventTransport;
  fallbackMs: number;
  deps: Pick<EventDeps, "now" | "sleep">;
  note: (message: string) => void;
}): EventWaiter {
  const { transport, fallbackMs, deps } = options;
  const health = createHealth(options.note);
  const seen = new Set<string>();

  const fresh = (events: EventEnvelope[]): EventEnvelope[] =>
    events.filter((event) => {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      if (seen.size > SEEN_LIMIT) seen.delete(seen.values().next().value!);
      return true;
    });

  return {
    engaged: (targets) => health.covers(targets),
    async wait(request) {
      const scopes = scopesOf(request.targets);
      const start = deps.now();
      const healthyMs = request.recheck ? request.sleepMs : Math.max(request.sleepMs, fallbackMs);
      const deadline = (degraded: boolean): number =>
        start + Math.min(degraded ? request.sleepMs : healthyMs, request.windowMs);
      let degraded = false;
      while (true) {
        const result = await transport.poll(scopes, Math.max(deadline(degraded) - deps.now(), 0));
        if (result.notice) options.note(result.notice);
        for (const { owner, reason } of result.uncovered ?? []) health.markUncovered(owner, reason);
        if (result.uncovered || result.unhealthy) degraded = true;
        if (result.unhealthy) health.markUnhealthy(result.unhealthy);
        else if (!result.uncovered) health.markHealthy();
        const hit = fresh(result.events).find((event) => matchesAny(event, request.targets));
        if (hit) {
          const hitAt = deps.now();
          const settled = Math.max(hitAt + SETTLE_MS, request.tickStartedAt + request.minGapMs);
          const wakeAt = Math.min(settled, Math.max(start + request.windowMs, hitAt));
          await deps.sleep(Math.max(wakeAt - hitAt, 0));
          return { wake: { kind: "event", event: hit }, degraded };
        }
        const left = deadline(degraded) - deps.now();
        if (left <= 0) return { wake: { kind: "timer" }, degraded };
        if (degraded) {
          await deps.sleep(left);
          return { wake: { kind: "timer" }, degraded };
        }
        if (transport.intervalMs > 0) await deps.sleep(Math.min(transport.intervalMs, left));
      }
    },
    close: () => transport.close(),
  };
}
