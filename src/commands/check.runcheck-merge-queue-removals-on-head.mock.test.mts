import { describe, it, expect } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  mockFetchPrBatch,
} from "../../test-helpers/commands/check.test-support.mts";
import { runCheck } from "./check.mts";

registerHooks();

const removal = {
  reason: "failed_checks",
  createdAtUnix: 1_700_000_000,
  beforeCommitOid: "queue-squash",
  beforeCommitParentOids: ["base-sha"],
};

function batch(overrides: Record<string, unknown>) {
  return makeBatchData({
    headRefOid: "pr-head",
    isMergeQueueEnabled: true,
    latestMergeQueueRemoval: removal,
    ...overrides,
  });
}

describe("runCheck — merge-queue removals on the current head", () => {
  it("counts removals since the head was pushed", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: batch({
        headPushedAtUnix: 1_699_000_000,
        mergeQueueRemovalTimesUnix: [1_698_000_000, 1_699_500_000, 1_700_000_000],
      }),
    });

    const report = await runCheck(BASE_OPTS);

    expect(report.mergeQueue?.removalsOnHead).toBe(2);
  });

  it("dates a force-pushed older commit by the force-push", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: batch({
        activity: {
          commitCount: 1,
          reviewRoundCount: 0,
          latestCommitCommittedAtUnix: 1_690_000_000,
          reviewItemsSinceLatestCommit: [],
        },
        headForcePushedAtUnix: 1_699_600_000,
        mergeQueueRemovalTimesUnix: [1_695_000_000, 1_699_500_000, 1_700_000_000],
      }),
    });

    const report = await runCheck(BASE_OPTS);

    expect(report.mergeQueue?.removalsOnHead).toBeUndefined();
  });

  it("uses the force-push alone when no commit time is known", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: batch({
        activity: undefined,
        headForcePushedAtUnix: 1_699_000_000,
        mergeQueueRemovalTimesUnix: [1_699_500_000, 1_700_000_000],
      }),
    });

    const report = await runCheck(BASE_OPTS);

    expect(report.mergeQueue?.removalsOnHead).toBe(2);
  });

  it("falls back to the head commit time and omits a single removal", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: batch({
        activity: {
          commitCount: 1,
          reviewRoundCount: 0,
          latestCommitCommittedAtUnix: 1_699_600_000,
          reviewItemsSinceLatestCommit: [],
        },
        mergeQueueRemovalTimesUnix: [1_699_500_000, 1_700_000_000],
      }),
    });

    const report = await runCheck(BASE_OPTS);

    expect(report.mergeQueue?.removalsOnHead).toBeUndefined();
  });
});
