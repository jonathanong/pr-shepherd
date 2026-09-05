import { describe, it, expect } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  defaultConfig,
  makeBatchData,
  makeThread,
  mockFetchPrBatch,
  mockLoadConfig,
  mockMarkSeen,
} from "../../test-helpers/commands/check.test-support.mts";
import { runCheck } from "./check.mts";

registerHooks();

describe("runCheck — merge-queue deferred seen markers", () => {
  it("does not mark a new actionable thread seen while its work is deferred (queued, --merge, workWhileQueued off)", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        isInMergeQueue: true,
        isMergeQueueEnabled: true,
        reviewThreads: [makeThread({ id: "t-new", author: "reviewer", authorType: "User" })],
      }),
    });

    const report = await runCheck({ ...BASE_OPTS, merge: true });

    expect(report.threads.actionable.map((t) => t.id)).toContain("t-new");
    expect(mockMarkSeen).not.toHaveBeenCalledWith(expect.anything(), "t-new", expect.anything());
  });

  it("marks the same new thread seen once workWhileQueued is enabled (not deferred)", async () => {
    mockLoadConfig.mockReturnValue({
      ...defaultConfig(),
      actions: { ...defaultConfig().actions, workWhileQueued: true },
    });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        isInMergeQueue: true,
        isMergeQueueEnabled: true,
        reviewThreads: [makeThread({ id: "t-new", author: "reviewer", authorType: "User" })],
      }),
    });

    await runCheck({ ...BASE_OPTS, merge: true });

    expect(mockMarkSeen).toHaveBeenCalledWith(expect.anything(), "t-new", expect.anything());
  });

  it("marks the same new thread seen when the PR is not actually in the queue", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        isInMergeQueue: false,
        reviewThreads: [makeThread({ id: "t-new", author: "reviewer", authorType: "User" })],
      }),
    });

    await runCheck({ ...BASE_OPTS, merge: true });

    expect(mockMarkSeen).toHaveBeenCalledWith(expect.anything(), "t-new", expect.anything());
  });
});
