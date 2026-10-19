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

import { runAggregatePollCommand, runIterateTick, runPollCommand } from "./tick.mts";

const NOW = Date.parse("2024-05-15T19:07:00.000Z");
const base = { repo: "owner/repo", pr: 42 };
const opts = { pr: 42, repo: { owner: "owner", repo: "repo" } } as never;

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  for (const fn of Object.values(m)) fn.mockReset();
  m.loadConfig.mockReturnValue({ iterate: { stallTimeoutMinutes: 60 } });
  m.readStallState.mockResolvedValue({ ok: true, state: null });
  vi.stubEnv("CLAUDE_CODE_REMOTE", "");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("runIterateTick", () => {
  it("runs one tick with seen markers persisted and reports a safety net", async () => {
    m.runIterate.mockResolvedValue({ action: "wait", ...base });
    const result = await runIterateTick(opts);
    expect(m.runIterate).toHaveBeenCalledTimes(1);
    expect(m.runIterate.mock.calls[0]![0]).toMatchObject({
      persistSeen: true,
      deferEditedCommentMarkers: false,
      fingerprintCache: false,
    });
    expect(result).toMatchObject({
      nextCheck: { reason: "safety-net", at: "2024-05-15T19:57:00Z" },
    });
  });

  it("holds a queued wake-up until the quota warning's interval", async () => {
    m.runIterate.mockResolvedValue({
      action: "wait",
      mergeQueue: { inQueue: true },
      quotaWarning: { pollIntervalMinutes: 10 },
      ...base,
    });
    expect(await runIterateTick(opts)).toMatchObject({
      nextCheck: { reason: "merge-queue", at: "2024-05-15T19:17:00Z", inSeconds: 600 },
    });
  });

  it("reports ready-delay and merge-queue deadlines", async () => {
    m.runIterate.mockResolvedValueOnce({ action: "ready", remainingSeconds: 127, ...base });
    expect(await runIterateTick(opts)).toMatchObject({
      nextCheck: { reason: "ready-delay", at: "2024-05-15T19:10:00Z", inSeconds: 180 },
    });
    m.runIterate.mockResolvedValueOnce({ action: "wait", mergeQueue: { inQueue: true }, ...base });
    expect(await runIterateTick(opts)).toMatchObject({
      nextCheck: { reason: "merge-queue" },
    });
  });

  it("omits nextCheck for terminal actions and mark-ready", async () => {
    m.runIterate.mockResolvedValueOnce({
      action: "cancel",
      reason: "auto-mark-ready-disabled",
      ...base,
    });
    expect(await runIterateTick(opts)).not.toHaveProperty("nextCheck");
    m.runIterate.mockResolvedValueOnce({ action: "mark_ready", ...base });
    expect(await runIterateTick(opts)).not.toHaveProperty("nextCheck");
  });

  it("uses the stall deadline when it comes first", async () => {
    const firstSeenAt = NOW / 1000 - 3600 + 90;
    m.readStallState.mockResolvedValue({ ok: true, state: { firstSeenAt } });
    m.runIterate.mockResolvedValue({ action: "wait", ...base });
    expect(await runIterateTick(opts)).toMatchObject({
      nextCheck: { reason: "stall-timeout", at: "2024-05-15T19:09:00Z" },
    });
    const safetyNet = { nextCheck: { reason: "safety-net" } };
    const noStall = { ...(opts as object), stallTimeoutSeconds: 0 } as never;
    expect(await runIterateTick(noStall)).toMatchObject(safetyNet);
    m.readStallState.mockResolvedValue({ ok: false });
    expect(await runIterateTick(opts)).toMatchObject(safetyNet);
    m.runIterate.mockResolvedValue({ action: "wait", repo: "broken", pr: 42 });
    expect(await runIterateTick(opts)).toMatchObject(safetyNet);
    m.runIterate.mockImplementation(async (o: { stallDeadlineSink: object }) => {
      Object.assign(o.stallDeadlineSink, { ciStartDeadlineSeconds: NOW / 1000 + 300 });
      return { action: "wait", ...base };
    });
    expect(await runIterateTick(opts)).toMatchObject({
      nextCheck: { reason: "stall-timeout", at: "2024-05-15T19:12:00Z" },
    });
  });

  it("returns fix_code unchanged and without nextCheck", async () => {
    const fixCode = { action: "fix_code", fix: { instructions: ["Rerun Shepherd now."] }, ...base };
    m.runIterate.mockResolvedValue(fixCode);
    expect(await runIterateTick(opts)).toBe(fixCode);
  });
});

describe("runPollCommand", () => {
  it("runs the sleeping loop outside a cloud session", async () => {
    m.runPoll.mockResolvedValue({ action: "wait", ...base });
    await runPollCommand({ ...(opts as object), intervalSeconds: 1, timeoutSeconds: 1 } as never);
    expect(m.runPoll).toHaveBeenCalledTimes(1);
    expect(m.runIterate).not.toHaveBeenCalled();
  });

  it("runs a single tick in a cloud session and drops loop options", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    m.runIterate.mockResolvedValue({ action: "wait", ...base });
    await runPollCommand({
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

describe("runAggregatePollCommand", () => {
  it("loops locally and runs one summary tick in a cloud session", async () => {
    const summary = {
      mode: "summary",
      repo: "owner/repo",
      selection: { kind: "prs", requested: [1, 2] },
      reason: "all_terminal",
      prs: [],
    };
    m.runAggregatePoll.mockResolvedValue(summary);
    m.runPollSummary.mockResolvedValue(summary);
    await runAggregatePollCommand({ prNumbers: [1, 2] } as never);
    expect(m.runAggregatePoll).toHaveBeenCalledTimes(1);
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await runAggregatePollCommand({ prNumbers: [1, 2] } as never);
    expect(m.runPollSummary).toHaveBeenCalledTimes(1);
    expect(m.runPollSummary).toHaveBeenCalledWith(expect.objectContaining({ tick: true }));
    expect(m.runAggregatePoll).toHaveBeenCalledTimes(1);
  });
});
