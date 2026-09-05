import { describe, it, expect } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  makeComment,
  mockFetchPrBatch,
  mockGetMergeableState,
  mockMarkSeen,
} from "../../test-helpers/commands/check.test-support.mts";
import { runCheck } from "./check.mts";

registerHooks();

describe("runCheck — merge-queue deferral uses the post-refresh merge status", () => {
  it("marks a first-look comment seen when the READY-triggered REST refresh discovers a conflict", async () => {
    // GraphQL alone reports a clean, all-passing, no-actionable-work state (status READY) for
    // a queued PR with only a first-look minimized comment. That READY status is exactly what
    // triggers the one-shot REST mergeability refresh, which here reveals a real conflict. The
    // deferral gate must use that final, refreshed status: a CONFLICTS-driven tick is never
    // deferred, so its seen marker must not be suppressed just because the PR happens to be
    // queued and GraphQL alone looked clean.
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        isInMergeQueue: true,
        isMergeQueueEnabled: true,
        comments: [makeComment({ id: "c-first-look", isMinimized: true })],
      }),
    });
    mockGetMergeableState.mockResolvedValue({
      mergeable: "CONFLICTING",
      mergeStateStatus: "DIRTY",
    });

    const report = await runCheck({ ...BASE_OPTS, merge: true });

    expect(report.mergeStatus.status).toBe("CONFLICTS");
    expect(report.comments.firstLook.map((c) => c.id)).toContain("c-first-look");
    expect(mockMarkSeen).toHaveBeenCalledWith(expect.anything(), "c-first-look", expect.anything());
  });
});
