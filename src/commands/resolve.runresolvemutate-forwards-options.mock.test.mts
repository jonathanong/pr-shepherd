import { describe, it, expect } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  mockApplyResolveOptions,
  mockFetchPrBatch,
} from "./resolve.test-support.mts";
import { runResolveMutate } from "./resolve.mts";

registerHooks();

describe("runResolveMutate — forwards options", () => {
  it("forwards all IDs and requireSha to applyResolveOptions", async () => {
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData() });
    await runResolveMutate({
      ...BASE_OPTS,
      resolveThreadIds: ["t-1"],
      minimizeCommentIds: ["c-1"],
      dismissReviewIds: ["r-1"],
      dismissMessage: "done",
      requireSha: "sha-abc",
    });
    expect(mockApplyResolveOptions).toHaveBeenCalledWith(
      42,
      { owner: "owner", name: "repo" },
      expect.objectContaining({
        resolveThreadIds: ["t-1"],
        replyThreadIds: undefined,
        minimizeCommentIds: ["c-1"],
        dismissReviewIds: ["r-1"],
        dismissMessage: "done",
        requireSha: "sha-abc",
      }),
    );
  });

  it("skips human resolve, minimize, and dismiss IDs before mutating", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewThreads: [
          {
            id: "t-human",
            isResolved: false,
            isOutdated: false,
            isMinimized: false,
            path: "src/foo.ts",
            line: 1,
            startLine: null,
            author: "alice",
            authorType: "User",
            body: "fix",
            url: "",
            createdAtUnix: 0,
          },
        ],
        comments: [
          {
            id: "c-human",
            isMinimized: false,
            author: "alice",
            authorType: "User",
            body: "note",
            url: "",
            createdAtUnix: 0,
          },
        ],
        changesRequestedReviews: [
          { id: "r-human", author: "alice", authorType: "User", body: "changes" },
        ],
      }),
    });
    mockApplyResolveOptions.mockResolvedValue({
      repliedThreads: [],
      resolvedThreads: [],
      minimizedComments: [],
      dismissedReviews: [],
      errors: [],
    });

    const result = await runResolveMutate({
      ...BASE_OPTS,
      resolveThreadIds: ["t-human", "t-bot"],
      minimizeCommentIds: ["c-human", "c-bot"],
      dismissReviewIds: ["r-human", "r-bot"],
      dismissMessage: "done",
    });

    expect(mockApplyResolveOptions).toHaveBeenCalledWith(
      42,
      { owner: "owner", name: "repo" },
      expect.objectContaining({
        resolveThreadIds: ["t-bot"],
        minimizeCommentIds: ["c-bot"],
        dismissReviewIds: ["r-bot"],
      }),
    );
    expect(result.skippedHumanResolves).toEqual(["t-human"]);
    expect(result.skippedHumanMinimizes).toEqual(["c-human"]);
    expect(result.skippedHumanDismissals).toEqual(["r-human"]);
  });
});
