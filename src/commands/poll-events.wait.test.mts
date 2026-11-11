import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventTransport, TransportResult } from "../events/types.mts";

const state = vi.hoisted(() => ({
  config: { source: "hook-harness", "fallback-interval-seconds": 300 } as {
    source: string;
    "fallback-interval-seconds": number;
  },
}));
vi.mock("../config/load.mts", () => ({ loadConfig: () => ({ events: state.config }) }));
vi.mock("../events/config.mts", () => ({ resolveEventsSource: vi.fn() }));
vi.mock("../events/relay.mts", () => ({
  createRelayTransport: vi.fn(),
  RELAY_REQUEST_TIMEOUT_MS: 10_000,
}));
vi.mock("../events/serve.mts", () => ({ createServeTransport: vi.fn() }));
vi.mock("../github/github-fetch.mts", () => ({ githubFetch: vi.fn() }));
vi.mock("../log/log-file.mts", () => ({ appendEntry: vi.fn() }));
vi.mock("../util/sleep.mts", () => ({
  sleep: vi.fn(async (ms: number) => {
    vi.setSystemTime(Date.now() + ms);
  }),
}));

import { resolveEventsSource } from "../events/config.mts";
import { createRelayTransport } from "../events/relay.mts";
import { appendEntry } from "../log/log-file.mts";
import { sleep } from "../util/sleep.mts";
import { pauseBeforeNextTick, withPollEvents, type PollEvents } from "./poll-events.mts";

const target = { repo: "acme/widgets", pr: 7 };
const hit = {
  id: "h",
  event: "check_suite",
  action: "completed",
  repo: "acme/widgets",
  prs: [7],
  headSha: null,
  headRef: null,
  baseRef: null,
};
let stderr: ReturnType<typeof vi.spyOn>;

function fakeTransport(results: TransportResult[]): EventTransport {
  return {
    intervalMs: 15_000,
    poll: vi.fn(async () => (results.length > 1 ? results.shift()! : results[0]!)),
    close: vi.fn(),
  };
}

async function enabled(results: TransportResult[], verbose = false): Promise<PollEvents> {
  vi.mocked(resolveEventsSource).mockReturnValue({ kind: "relay", url: "https://r", token: "t" });
  vi.mocked(createRelayTransport).mockReturnValue(fakeTransport(results));
  let events: PollEvents | undefined;
  await withPollEvents(verbose, async (value) => {
    events = value;
  });
  return events!;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(1_000_000);
  state.config = { source: "hook-harness", "fallback-interval-seconds": 300 };
  stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});
afterEach(() => {
  vi.useRealTimers();
  stderr.mockRestore();
});

const input = (overrides = {}) => ({
  targets: [target],
  sleepMs: 60_000,
  intervalMs: 60_000,
  tickStartedAt: Date.now(),
  remainingMs: Infinity,
  recheck: false,
  label: "poll tick 1 / +0s",
  ...overrides,
});

describe("waitTick", () => {
  it("wakes on an event, reports it only to verbose progress and the debug log", async () => {
    const events = await enabled([{ events: [hit] }], true);
    const elapsed = await events.waitTick(input({ remainingMs: 100_000 }));
    expect(elapsed).toBe(false);
    expect(stderr).toHaveBeenCalledWith(
      "[poll tick 1 / +0s] woke on check_suite.completed acme/widgets\n",
    );
    expect(appendEntry).toHaveBeenCalledWith(
      "- [poll tick 1 / +0s] woke on check_suite.completed acme/widgets\n",
    );
  });

  it("stays quiet on stderr unless verbose, but still logs", async () => {
    const events = await enabled([{ events: [{ ...hit, action: null, repo: "acme/widgets" }] }]);
    await events.waitTick(input());
    expect(stderr).not.toHaveBeenCalled();
    expect(appendEntry).toHaveBeenCalledWith(
      expect.stringContaining("woke on check_suite acme/widgets"),
    );
  });

  it("describes an owner-level event without a repo", async () => {
    const events = await enabled([{ events: [{ ...hit, repo: null, prs: [] }] }]);
    await events.waitTick(input({ remainingMs: 1_000 }));
    expect(appendEntry).toHaveBeenCalledWith(expect.stringContaining("woke on fallback timer"));
  });

  it("returns true when the window elapses with no event, using the fallback deadline otherwise", async () => {
    const events = await enabled([{ events: [] }]);
    const start = Date.now();
    expect(await events.waitTick(input({ remainingMs: 100_000 }))).toBe(true);
    expect(Date.now() - start).toBe(100_000);
    expect(await events.waitTick(input({ remainingMs: 1_000_000 }))).toBe(false);
    expect(Date.now() - start).toBe(100_000 + 300_000);
  });

  it("notes a degraded source and passes the larger quota floor as the minimum gap", async () => {
    const events = await enabled([{ events: [], unhealthy: "relay answered HTTP 503" }], true);
    const start = Date.now();
    await events.waitTick(input({ sleepMs: 120_000, intervalMs: 60_000, remainingMs: Infinity }));
    expect(Date.now() - start).toBe(120_000);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("timer (events unavailable)"));
    expect(events.engaged([target])).toBe(true);
  });
});

describe("waitTick deadline cap", () => {
  it("wakes at a time-based deadline and says so", async () => {
    const events = await enabled([{ events: [] }]);
    const start = Date.now();
    await events.waitTick(input({ deadlineAt: start + 100_000 }));
    expect(Date.now() - start).toBe(100_000);
    expect(appendEntry).toHaveBeenCalledWith(
      expect.stringContaining("woke on stall-timeout deadline"),
    );
  });

  it("keeps the plain interval as the floor for a past deadline", async () => {
    const events = await enabled([{ events: [] }]);
    const start = Date.now();
    await events.waitTick(input({ deadlineAt: start - 5_000 }));
    expect(Date.now() - start).toBe(60_000);
  });

  it("ignores a deadline beyond the fallback interval", async () => {
    const events = await enabled([{ events: [] }]);
    const start = Date.now();
    await events.waitTick(input({ deadlineAt: start + 900_000 }));
    expect(Date.now() - start).toBe(300_000);
    expect(appendEntry).toHaveBeenCalledWith(expect.stringContaining("woke on fallback timer"));
  });
});

describe("pauseBeforeNextTick", () => {
  const base = { announce: vi.fn(), ...input() };

  it("sleeps plainly without events and announces first", async () => {
    const announce = vi.fn();
    expect(await pauseBeforeNextTick({ ...base, events: undefined, announce })).toBe(false);
    expect(announce).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledWith(60_000);
  });

  it("stops when the window is over, or when a plain sleep would not fit", async () => {
    const announce = vi.fn();
    expect(
      await pauseBeforeNextTick({ ...base, events: undefined, announce, remainingMs: 0 }),
    ).toBe(true);
    expect(
      await pauseBeforeNextTick({ ...base, events: undefined, announce, remainingMs: 59_000 }),
    ).toBe(true);
    expect(
      await pauseBeforeNextTick({ ...base, events: undefined, announce, remainingMs: 59_600 }),
    ).toBe(false);
    expect(announce).toHaveBeenCalledOnce();
  });

  it("does not break for a short window when events are engaged", async () => {
    const events = await enabled([{ events: [] }]);
    expect(await pauseBeforeNextTick({ ...base, events, remainingMs: 30_000 })).toBe(true);
    expect(sleep).toHaveBeenCalledWith(15_000);
  });

  it("falls back to plain handling once the owner is uncovered", async () => {
    const events = await enabled([
      { events: [], uncovered: [{ owner: "acme", reason: "relay answered HTTP 403" }] },
    ]);
    await events.waitTick(input({ remainingMs: 1_000 }));
    expect(await pauseBeforeNextTick({ ...base, events, remainingMs: 30_000 })).toBe(true);
    expect(await pauseBeforeNextTick({ ...base, events, remainingMs: 100_000 })).toBe(false);
  });
});
