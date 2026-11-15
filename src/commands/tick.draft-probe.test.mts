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

import { runPollSummaryTick } from "./tick.mts";

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  m.loadConfig.mockReturnValue({ iterate: { "stall-timeout-minutes": 60 } });
  m.readStackStallDeadline.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("aggregate tick wake-up for draft probes", () => {
  const summary = (over: object = {}) => ({
    reason: "waiting",
    prs: [{ pr: 1 }],
    instructions: ["1. first"],
    ...over,
  });

  it("keeps a wake-up for a stack whose draft probe is another author's or unreadable", async () => {
    const probe = { reasons: ["draft-readiness-verification-required"], action: "wait" };
    for (const prs of [
      [
        { pr: 1, owned: true, action: "cancel" },
        { pr: 2, ...probe },
      ],
      [
        { pr: 1, owned: true, ...probe },
        { pr: 2, state: "UNKNOWN", action: "wait" },
      ],
    ]) {
      m.runPollSummary.mockResolvedValue(
        summary({ selection: { kind: "stack" }, reason: "waiting", prs }),
      );
      const result = await runPollSummaryTick({} as never);
      expect(result).toMatchObject({ nextCheck: { reason: "safety-net" } });
    }
    m.runPollSummary.mockResolvedValue(
      summary({
        selection: { kind: "stack" },
        prs: [{ pr: 1, owned: true, ...probe }],
      }),
    );
    expect(await runPollSummaryTick({} as never)).not.toHaveProperty("nextCheck");
  });
});
