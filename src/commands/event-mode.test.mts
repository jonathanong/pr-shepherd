import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const m = vi.hoisted(() => ({
  runIterate: vi.fn(),
  runPoll: vi.fn(),
  runPollSummary: vi.fn(),
  runAggregatePoll: vi.fn(),
  readStallState: vi.fn(),
  loadConfig: vi.fn(),
}));
vi.mock("./iterate/index.mts", () => ({ runIterate: m.runIterate }));
vi.mock("./poll.mts", () => ({ runPoll: m.runPoll }));
vi.mock("./poll-summary.mts", () => ({
  runPollSummary: m.runPollSummary,
  runAggregatePoll: m.runAggregatePoll,
}));
vi.mock("../state/iterate-stall.mts", () => ({ readStallState: m.readStallState }));
vi.mock("../config/load.mts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../config/load.mts")>()),
  loadConfig: m.loadConfig,
}));

import { runIterateForMode, runPollForMode } from "./event-mode.mts";
const FIX_CODE_CONTINUATION =
  "`[FIX_CODE]` is non-terminal. Iterate immediately with the same options.";
import { durableStateRequested } from "../state/durable-state.mts";

const NOW = Date.parse("2024-05-15T19:07:00.000Z");
const base = { repo: "owner/repo", pr: 42 };
const opts = { pr: 42, repo: { owner: "owner", repo: "repo" } } as never;

function config(mode: "auto" | "poll" | "event" = "event") {
  return { poll: { mode }, iterate: { stallTimeoutMinutes: 60 } };
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  for (const fn of Object.values(m)) fn.mockReset();
  m.loadConfig.mockReturnValue(config());
  m.readStallState.mockResolvedValue({ ok: true, state: null });
  vi.stubEnv("CLAUDE_CODE_REMOTE", "");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("mode selection", () => {
  it("follows the request, then config, then the cloud environment", async () => {
    m.runIterate.mockResolvedValue({ action: "wait", ...base });
    const polled = async (pollMode?: "poll") =>
      (await runIterateForMode({ ...(opts as object), pollMode } as never)) as {
        pollMode?: string;
      };
    expect((await polled()).pollMode).toBe("event");
    expect((await polled("poll")).pollMode).toBeUndefined();
    m.loadConfig.mockReturnValue(config("auto"));
    expect((await polled()).pollMode).toBeUndefined();
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    expect((await polled()).pollMode).toBe("event");
  });
});

describe("runIterateForMode", () => {
  it("passes through in poll mode", async () => {
    m.runIterate.mockResolvedValue({ action: "wait", ...base });
    const result = await runIterateForMode({ ...(opts as object), pollMode: "poll" } as never);
    expect(result).toEqual({ action: "wait", ...base });
    expect(m.runIterate).toHaveBeenCalledWith(expect.objectContaining({ pollMode: "poll" }));
  });

  it("runs one durable tick with seen markers persisted and reports a safety net", async () => {
    let durable = false;
    m.runIterate.mockImplementation(async () => {
      durable = durableStateRequested();
      return { action: "wait", ...base };
    });
    const result = await runIterateForMode(opts);
    expect(durable).toBe(true);
    expect(m.runIterate).toHaveBeenCalledTimes(1);
    expect(m.runIterate.mock.calls[0]![0]).toMatchObject({
      persistSeen: true,
      fingerprintCache: false,
    });
    expect(m.runIterate.mock.calls[0]![0]).not.toHaveProperty("pollMode");
    expect(result).toMatchObject({
      pollMode: "event",
      nextCheck: { reason: "safety-net", at: "2024-05-15T19:57:00Z" },
    });
  });

  it("reports ready-delay and merge-queue deadlines", async () => {
    m.runIterate.mockResolvedValueOnce({ action: "ready", remainingSeconds: 127, ...base });
    expect(await runIterateForMode(opts)).toMatchObject({
      nextCheck: { reason: "ready-delay", at: "2024-05-15T19:10:00Z", inSeconds: 180 },
    });
    m.runIterate.mockResolvedValueOnce({ action: "wait", mergeQueue: { inQueue: true }, ...base });
    expect(await runIterateForMode(opts)).toMatchObject({
      nextCheck: { reason: "merge-queue" },
    });
  });

  it("omits nextCheck for terminal actions, mark-ready, and a stack draft hold", async () => {
    m.runIterate.mockResolvedValueOnce({ action: "cancel", ...base });
    const cancel = await runIterateForMode(opts);
    expect(cancel).toMatchObject({ pollMode: "event" });
    expect(cancel).not.toHaveProperty("nextCheck");
    m.runIterate.mockResolvedValueOnce({ action: "wait", stackDraftHold: {}, ...base });
    expect(await runIterateForMode(opts)).not.toHaveProperty("nextCheck");
    m.runIterate.mockResolvedValueOnce({ action: "mark_ready", ...base });
    expect(await runIterateForMode(opts)).not.toHaveProperty("nextCheck");
  });

  it("uses the stall deadline when it comes first", async () => {
    const firstSeenAt = NOW / 1000 - 3600 + 90;
    m.readStallState.mockResolvedValue({ ok: true, state: { firstSeenAt } });
    m.runIterate.mockResolvedValue({ action: "wait", ...base });
    expect(await runIterateForMode(opts)).toMatchObject({
      nextCheck: { reason: "stall-timeout", at: "2024-05-15T19:09:00Z" },
    });
    expect(
      await runIterateForMode({ ...(opts as object), stallTimeoutSeconds: 0 } as never),
    ).toMatchObject({
      nextCheck: { reason: "safety-net" },
    });
    m.readStallState.mockResolvedValue({ ok: false });
    expect(await runIterateForMode(opts)).toMatchObject({ nextCheck: { reason: "safety-net" } });
    m.runIterate.mockResolvedValue({ action: "wait", repo: "broken", pr: 42 });
    expect(await runIterateForMode(opts)).toMatchObject({ nextCheck: { reason: "safety-net" } });
  });

  it("rewrites only the fix_code continuation, plain or quota-aware", async () => {
    const quota =
      "`[FIX_CODE]` is non-terminal. After completing these steps, GitHub's GraphQL API quota is low. Poll no more often than every 5 minutes.";
    for (const continuation of [FIX_CODE_CONTINUATION, quota]) {
      m.runIterate.mockResolvedValue({
        action: "fix_code",
        fix: { instructions: ["1. do it", continuation] },
        ...base,
      });
      const result = await runIterateForMode(opts);
      expect(result).toMatchObject({ action: "fix_code" });
      const steps = (result as { fix: { instructions: string[] } }).fix.instructions;
      expect(steps[0]).toBe("1. do it");
      expect(steps[1]).toContain("end the turn without sleeping");
      expect(steps[1]).toContain('Playbook: "Cloud event loop"');
    }
  });

  it("leaves fix_code untouched when no next check applies", async () => {
    m.readStallState.mockResolvedValue({ ok: true, state: null });
    m.runIterate.mockResolvedValue({
      action: "fix_code",
      fix: { instructions: [FIX_CODE_CONTINUATION] },
      ...base,
    });
    expect(await runIterateForMode(opts)).toMatchObject({ nextCheck: expect.any(Object) });
  });
});

describe("runPollForMode", () => {
  it("runs the sleeping loop in poll mode", async () => {
    m.runPoll.mockResolvedValue({ action: "wait", ...base });
    await runPollForMode({
      ...(opts as object),
      pollMode: "poll",
      intervalSeconds: 1,
      timeoutSeconds: 1,
    } as never);
    expect(m.runPoll).toHaveBeenCalledTimes(1);
  });

  it("runs a single tick in event mode and drops loop options", async () => {
    m.runIterate.mockResolvedValue({ action: "wait", ...base });
    await runPollForMode({
      ...(opts as object),
      intervalSeconds: 60,
      timeoutSeconds: 270,
      debounceSeconds: 60,
      quietStatus: true,
      untilTerminal: true,
    } as never);
    expect(m.runPoll).not.toHaveBeenCalled();
    const passed = m.runIterate.mock.calls[0]![0];
    for (const key of [
      "intervalSeconds",
      "timeoutSeconds",
      "debounceSeconds",
      "quietStatus",
      "untilTerminal",
    ]) {
      expect(passed).not.toHaveProperty(key);
    }
  });
});
