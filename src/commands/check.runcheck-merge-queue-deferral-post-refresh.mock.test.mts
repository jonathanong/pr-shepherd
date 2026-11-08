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
  it("defers a first-look comment when the READY-triggered REST refresh discovers a queued conflict", async () => {
    // GraphQL alone reports a clean, all-passing, no-actionable-work state (status READY) for
    // a queued PR with only a first-look minimized comment. That READY status is exactly what
    // triggers the one-shot REST mergeability refresh, which here reveals a real conflict. The
    // deferral gate must use that final, refreshed status: without `--merge`, the pre-refresh
    // READY state would not defer anything, but a queued conflict holds review work until the
    // PR leaves the queue, so the seen marker must stay unwritten.
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

    const report = await runCheck(BASE_OPTS);

    expect(report.mergeStatus.status).toBe("CONFLICTS");
    expect(report.comments.firstLook.map((c) => c.id)).toContain("c-first-look");
    expect(mockMarkSeen).not.toHaveBeenCalledWith(
      expect.anything(),
      "c-first-look",
      expect.anything(),
    );
  });
});
