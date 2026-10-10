import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const m = vi.hoisted(() => ({
  runPollSummary: vi.fn(),
  runAggregatePoll: vi.fn(),
  loadConfig: vi.fn(),
  readStackStallDeadline: vi.fn(),
}));
vi.mock("./stack-stall.mts", () => ({
  readStackStallDeadline: m.readStackStallDeadline,
}));
vi.mock("./poll-summary.mts", () => ({
  runPollSummary: m.runPollSummary,
  runAggregatePoll: m.runAggregatePoll,
}));
vi.mock("../config/load.mts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../config/load.mts")>()),
  loadConfig: m.loadConfig,
}));

import { runAggregatePollForMode, runPollSummaryForMode } from "./event-mode.mts";

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  m.loadConfig.mockReturnValue({ poll: { mode: "event" }, iterate: { stallTimeoutMinutes: 60 } });
  m.readStackStallDeadline.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("aggregate event mode", () => {
  const summary = (over: object = {}) => ({
    reason: "waiting",
    prs: [{ pr: 1 }],
    instructions: ["1. first"],
    ...over,
  });

  it("passes through in poll mode", async () => {
    m.runPollSummary.mockResolvedValue(summary());
    m.runAggregatePoll.mockResolvedValue(summary());
    await runPollSummaryForMode({ pollMode: "poll" } as never);
    await runAggregatePollForMode({ pollMode: "poll" } as never);
    expect(m.runPollSummary).toHaveBeenCalledTimes(1);
    expect(m.runAggregatePoll).toHaveBeenCalledTimes(1);
  });

  it("adds a safety net and a numbered step", async () => {
    m.runPollSummary.mockResolvedValue(summary());
    const result = await runAggregatePollForMode({} as never);
    expect(m.runAggregatePoll).not.toHaveBeenCalled();
    expect(result).toMatchObject({ pollMode: "event", nextCheck: { reason: "safety-net" } });
    expect(result.instructions).toHaveLength(2);
    expect(result.instructions![1]).toMatch(/^2\. Event mode: end this turn now/);
  });

  it("prefers a ready-delay countdown and a queue wait", async () => {
    m.runPollSummary.mockResolvedValue(
      summary({
        reason: "actionable",
        prs: [
          { pr: 1, remainingSeconds: 100 },
          { pr: 2, remainingSeconds: 0 },
        ],
      }),
    );
    const delayed = await runPollSummaryForMode({} as never);
    expect(delayed.nextCheck).toMatchObject({ reason: "ready-delay" });
    expect(delayed.instructions![1]).toContain("once the steps above are done");
    m.runPollSummary.mockResolvedValue(
      summary({ prs: [{ pr: 1, isInMergeQueue: true }], instructions: undefined }),
    );
    const queued = await runPollSummaryForMode({} as never);
    expect(queued.nextCheck).toMatchObject({ reason: "merge-queue" });
    expect(queued.instructions![0]).toMatch(/^1\. /);
  });

  it("omits nextCheck once nothing is left to watch", async () => {
    for (const over of [
      { reason: "all_terminal" },
      { nextAction: "cancel" },
      { nextAction: "escalate" },
    ]) {
      m.runPollSummary.mockResolvedValue(summary(over));
      const result = await runPollSummaryForMode({} as never);
      expect(result).toMatchObject({ pollMode: "event" });
      expect(result).not.toHaveProperty("nextCheck");
    }
  });

  it("runs the tick with event mode so child poll commands carry it", async () => {
    m.runPollSummary.mockResolvedValue(summary());
    await runPollSummaryForMode({} as never);
    expect(m.runPollSummary).toHaveBeenCalledWith({ pollMode: "event" });
  });

  it("schedules the stack stall deadline before the safety net", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    m.readStackStallDeadline.mockResolvedValue(nowSeconds + 600);
    m.runPollSummary.mockResolvedValue(summary());
    const result = await runPollSummaryForMode({} as never);
    expect(m.readStackStallDeadline).toHaveBeenCalledWith(expect.anything(), 3600);
    expect(result.nextCheck).toMatchObject({
      reason: "stall-timeout",
    });
    expect(result.nextCheck!.inSeconds).toBeLessThanOrEqual(660);
    await runPollSummaryForMode({ stallTimeoutSeconds: 120 } as never);
    expect(m.readStackStallDeadline).toHaveBeenLastCalledWith(expect.anything(), 120);
  });
});
