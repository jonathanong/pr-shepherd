import { describe, it, expect } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  mockFetchPrBatch,
} from "../../test-helpers/commands/check.test-support.mts";
import { runCheck } from "./check.mts";

registerHooks();

describe("runCheck — merge-queue removal freshness", () => {
  it("treats the head as not updated (removal still current) when it is a parent of the removed commit", async () => {
    // The synthetic "beforeCommit" is a merge of the base branch and the PR head at removal
    // time; if the current head still matches that parent, no push has happened since the
    // removal, so it remains current and actionable.
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        headRefOid: "pr-head-at-removal",
        isMergeQueueEnabled: true,
        latestMergeQueueRemoval: {
          reason: "MANUAL",
          createdAtUnix: 1_700_000_000,
          beforeCommitOid: "queue-old",
          beforeCommitParentOids: ["base-sha", "pr-head-at-removal"],
        },
      }),
    });

    const report = await runCheck(BASE_OPTS);

    expect(report.mergeQueue?.latestRemoval?.reason).toBe("MANUAL");
    expect(report.mergeQueue?.headUpdatedAfterRemoval).toBeUndefined();
  });

  it("treats the head as updated (stale removal) once it no longer matches a parent of the removed commit", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        headRefOid: "new-head-after-push",
        isMergeQueueEnabled: true,
        latestMergeQueueRemoval: {
          reason: "MANUAL",
          createdAtUnix: 1_700_000_000,
          beforeCommitOid: "queue-old",
          beforeCommitParentOids: ["base-sha", "pr-head-at-removal"],
        },
      }),
    });

    const report = await runCheck(BASE_OPTS);

    expect(report.mergeQueue?.headUpdatedAfterRemoval).toBe(true);
  });

  it("treats an unverifiable removal (GitHub omitted the removed commit) as stale rather than current", async () => {
    // GitHub's `timelineItems(last: 1, ...)` keeps returning the single most recent removal
    // event forever, even long after the PR moved on. If that old event's synthetic commit is
    // no longer available (beforeCommitOid/beforeCommitParentOids both absent), freshness can't
    // be verified — this must not be treated as "still current", or it would escalate
    // `merge-queue-removed` permanently with no way to clear it.
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        headRefOid: "current-head",
        isMergeQueueEnabled: true,
        latestMergeQueueRemoval: {
          reason: "MANUAL",
          createdAtUnix: 1_700_000_000,
        },
      }),
    });

    const report = await runCheck(BASE_OPTS);

    expect(report.mergeQueue?.latestRemoval?.reason).toBe("MANUAL");
    expect(report.mergeQueue?.headUpdatedAfterRemoval).toBe(true);
  });
});
