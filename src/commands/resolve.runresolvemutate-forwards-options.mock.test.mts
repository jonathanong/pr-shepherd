import { describe, it, expect } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  makeComment,
  makeThread,
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
        reviewThreads: [makeThread({ id: "t-human", authorType: "User" })],
        comments: [makeComment({ id: "c-human", author: "alice", authorType: "User" })],
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

  it("only replies to fetched human thread IDs", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewThreads: [
          makeThread({ id: "t-human", authorType: "User" }),
          makeThread({
            id: "t-bot",
            line: 2,
            author: "copilot-pull-request-reviewer",
            authorType: "Bot",
            body: "bot note",
          }),
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
      replyThreadIds: ["t-human", "t-bot", "t-typo"],
      dismissMessage: "done",
    });

    expect(mockApplyResolveOptions).toHaveBeenCalledWith(
      42,
      { owner: "owner", name: "repo" },
      expect.objectContaining({
        replyThreadIds: ["t-human"],
      }),
    );
    expect(result.skippedNonHumanReplies).toEqual(["t-bot", "t-typo"]);
  });
});
