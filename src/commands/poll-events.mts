import { loadConfig } from "../config/load.mts";
import { resolveEventsSource } from "../events/config.mts";
import { createRelayTransport, RELAY_REQUEST_TIMEOUT_MS } from "../events/relay.mts";
import { createServeTransport } from "../events/serve.mts";
import type { IterateResult, PollSummaryResult } from "../types.mts";
import type { EventTransport, WatchTarget } from "../events/types.mts";
import { createEventWaiter, type EventWaiter, type Wake } from "../events/waiter.mts";
import { githubFetch } from "../github/github-fetch.mts";
import { appendEntry } from "../log/log-file.mts";
import { sleep } from "../util/sleep.mts";

const TIMER_DRIFT_TOLERANCE_MS = 500;

interface WaitTickInput {
  /** Progress prefix, e.g. `poll tick 3 / +45s`. */
  label: string;
  targets: readonly WatchTarget[];
  sleepMs: number;
  intervalMs: number;
  tickStartedAt: number;
  /** Time left in the poll window; `Infinity` for `--until-terminal`. */
  remainingMs: number;
  recheck: boolean;
}

export interface PollEvents {
  engaged(targets: readonly WatchTarget[]): boolean;
  /** Wait for the next tick. Returns true when the poll window elapsed with no event. */
  waitTick(input: WaitTickInput): Promise<boolean>;
  close(): void;
}

function describe(wake: Wake, degraded: boolean): string {
  if (wake.kind === "timer") return degraded ? "timer (events unavailable)" : "fallback timer";
  const { event, action, repo } = wake.event;
  return `${action ? `${event}.${action}` : event} ${repo ?? ""}`.trim();
}

function createTransport(startMs: number): EventTransport {
  const source = resolveEventsSource();
  return source.kind === "serve"
    ? createServeTransport(source, startMs, {
        fetch: (input, init) => globalThis.fetch(input, init),
      })
    : createRelayTransport(source, startMs, {
        fetch: (input, init) => githubFetch(input, init, RELAY_REQUEST_TIMEOUT_MS),
      });
}

/**
 * The event-driven wait for a poll loop, or `undefined` when `events.source` is `none`. Captures
 * the start time now, before the first tick snapshots GitHub, so no event in between is missed.
 * Throws a config error when hook-harness is selected but no source resolves.
 */
function createPollEvents(verbose: boolean): PollEvents | undefined {
  const config = loadConfig().events;
  if (config.source === "none") return undefined;
  const note = (message: string): void => {
    if (verbose) process.stderr.write(`${message}\n`);
    appendEntry(`- ${message}\n`);
  };
  const waiter: EventWaiter = createEventWaiter({
    transport: createTransport(Date.now()),
    fallbackMs: config["fallback-interval-seconds"] * 1000,
    deps: { now: () => Date.now(), sleep },
    note,
  });
  return {
    engaged: (targets) => waiter.engaged(targets),
    close: () => waiter.close(),
    async waitTick(input) {
      const waitStart = Date.now();
      const { wake, degraded } = await waiter.wait({
        targets: input.targets,
        sleepMs: input.sleepMs,
        windowMs: input.remainingMs,
        recheck: input.recheck,
        // Events never make ticks more frequent than plain polling would.
        minGapMs: input.sleepMs,
        tickStartedAt: input.tickStartedAt,
      });
      note(`[${input.label}] woke on ${describe(wake, degraded)}`);
      return (
        wake.kind === "timer" &&
        Date.now() - waitStart + TIMER_DRIFT_TOLERANCE_MS >= input.remainingMs
      );
    },
  };
}

/** Run a poll with its event wait (if configured), always closing the source afterwards. */
export async function withPollEvents<T>(
  verbose: boolean,
  run: (events: PollEvents | undefined) => Promise<T>,
): Promise<T> {
  const events = createPollEvents(verbose);
  try {
    return await run(events);
  } finally {
    events?.close();
  }
}

export interface PauseInput extends WaitTickInput {
  events: PollEvents | undefined;
  /** `viaEvents` is true when the pause waits for an event rather than sleeping. */
  announce: (viaEvents: boolean) => void;
}

/**
 * Pause until the next tick, by event wait when engaged and by plain sleep otherwise. Returns
 * true when the poll should stop: the window is over, or (without events) the next sleep would
 * not fit in what is left. `announce` runs once the pause is certain, before it starts.
 */
export async function pauseBeforeNextTick(input: PauseInput): Promise<boolean> {
  const { events, announce, ...wait } = input;
  const viaEvents = events?.engaged(wait.targets) === true;
  const { remainingMs, sleepMs } = wait;
  if (remainingMs <= 0 || (!viaEvents && remainingMs + TIMER_DRIFT_TOLERANCE_MS < sleepMs)) {
    return true;
  }
  announce(viaEvents);
  if (!events || !viaEvents) {
    await sleep(sleepMs);
    return false;
  }
  return events.waitTick(wait);
}

/** The one PR a single-PR tick watched; head SHA and ref come from that tick's batch data. */
export function onePrTargets(
  result: Pick<IterateResult, "repo" | "pr" | "baseBranch">,
  head: { headSha?: string; headRef?: string },
): WatchTarget[] {
  return [
    {
      repo: result.repo,
      pr: result.pr,
      baseRef: result.baseBranch,
      ...(head.headSha && { headSha: head.headSha }),
      ...(head.headRef && { headRef: head.headRef }),
    },
  ];
}

/** Every open PR of an aggregate tick. */
export function aggregateTargets(result: PollSummaryResult): WatchTarget[] {
  return result.prs
    .filter((item) => item.state === "OPEN")
    .map((item) => ({
      repo: item.repo,
      pr: item.pr,
      headSha: item.headRefOid,
      headRef: item.headRefName,
      baseRef: item.baseRefName,
    }));
}
