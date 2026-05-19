import { describe, it, expect } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  makeCheck,
  mockAutoResolveOutdated,
  mockFetchPrBatch,
  mockFetchStartupFailureChecks,
  mockGetMergeableState,
  mockLoadSeenMap,
  mockMarkSeen,
  mockTriageFailingChecks,
  makeThread,
  makeComment,
} from "./check.test-support.mts";
import { runCheck } from "./check.mts";

registerHooks();

describe("runCheck — terminal PR state", () => {
  it("returns MERGED and skips CI/comment processing when PR is MERGED", async () => {
    const failingCheck = makeCheck({ category: "failing", conclusion: "FAILURE" });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        state: "MERGED",
        mergeable: "UNKNOWN",
        mergeStateStatus: "UNKNOWN",
        checks: [failingCheck],
        reviewThreads: [makeThread({ id: "t-outdated", isOutdated: true })],
        comments: [makeComment({ id: "c-min", isMinimized: true })],
      }),
    });

    const report = await runCheck({ ...BASE_OPTS, autoResolve: true });

    expect(report.status).toBe("MERGED");
    expect(report.mergeStatus.state).toBe("MERGED");
    expect(report.mergeStatus.status).toBe("UNKNOWN");
    expect(report.checks.failing).toEqual([]);
    expect(report.threads.firstLook).toEqual([]);
    expect(report.comments.firstLook).toEqual([]);
    expect(mockGetMergeableState).not.toHaveBeenCalled();
    expect(mockFetchStartupFailureChecks).not.toHaveBeenCalled();
    expect(mockTriageFailingChecks).not.toHaveBeenCalled();
    expect(mockAutoResolveOutdated).not.toHaveBeenCalled();
    expect(mockLoadSeenMap).not.toHaveBeenCalled();
    expect(mockMarkSeen).not.toHaveBeenCalled();
  });

  it("returns CLOSED and skips CI/comment processing when PR is CLOSED", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        state: "CLOSED",
        mergeable: "UNKNOWN",
        mergeStateStatus: "UNKNOWN",
        checks: [makeCheck({ category: "in_progress", status: "IN_PROGRESS", conclusion: null })],
        reviewThreads: [makeThread({ id: "t-active" })],
        comments: [makeComment({ id: "c-active" })],
      }),
    });

    const report = await runCheck(BASE_OPTS);

    expect(report.status).toBe("CLOSED");
    expect(report.mergeStatus.state).toBe("CLOSED");
    expect(report.checks.inProgress).toEqual([]);
    expect(report.threads.actionable).toEqual([]);
    expect(report.comments.actionable).toEqual([]);
    expect(mockGetMergeableState).not.toHaveBeenCalled();
    expect(mockFetchStartupFailureChecks).not.toHaveBeenCalled();
    expect(mockTriageFailingChecks).not.toHaveBeenCalled();
    expect(mockAutoResolveOutdated).not.toHaveBeenCalled();
    expect(mockLoadSeenMap).not.toHaveBeenCalled();
    expect(mockMarkSeen).not.toHaveBeenCalled();
  });
});
