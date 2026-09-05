import { describe, it, expect } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  makeComment,
  makeThread,
  mockApplyResolveOptions,
  mockFetchPrBatch,
  mockMarkReplySeen,
} from "../../test-helpers/commands/resolve.test-support.mts";
import { runResolveMutate } from "./resolve.mts";
import { addPrShepherdMarker } from "../comments/marker.mts";

registerHooks();

describe("runResolveMutate — forwards options", () => {
  it("forwards requested IDs without rechecking authorization", async () => {
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData() });
    const firstResult = await runResolveMutate({
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
        dismissReviewIds: [],
        dismissMessage: "done",
        requireSha: "sha-abc",
      }),
    );
    const result = await runResolveMutate({
      ...BASE_OPTS,
      resolveThreadIds: ["t-unknown"],
    });
    expect(result.skippedUnauthorizedResolves).toBeUndefined();
    expect(firstResult.skippedDismissals).toEqual(["r-1"]);
    expect(mockFetchPrBatch).toHaveBeenCalledWith(
      42,
      { owner: "owner", name: "repo" },
      {
        paginateApprovedReviews: true,
      },
    );
  });

  it("keeps human-content policy while dropping authorization preflights", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewThreads: [
          makeThread({ id: "t-human", authorType: "User" }),
          makeThread({ id: "t-bot", author: "bot[bot]", authorType: "Bot" }),
        ],
        comments: [
          makeComment({ id: "c-human", author: "alice", authorType: "User" }),
          makeComment({ id: "c-bot", author: "bot[bot]", authorType: "Bot" }),
        ],
        changesRequestedReviews: [
          { id: "r-human", author: "alice", authorType: "User", body: "changes" },
          { id: "r-bot", author: "bot[bot]", authorType: "Bot", body: "changes" },
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

  it("replies to fetched human and bot thread IDs", async () => {
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
        replyThreadIds: ["t-human", "t-bot"],
      }),
    );
    expect(result.skippedNonHumanReplies).toEqual(["t-typo"]);
  });

  it("updates the seen marker after successfully replying to a human thread", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewThreads: [
          makeThread({
            id: "t-human",
            authorType: "User",
            body: "top body",
            comments: [
              {
                id: "c-1",
                isMinimized: false,
                author: "alice",
                authorType: "User",
                body: "top body",
                url: "",
                createdAtUnix: 1,
              },
            ],
          }),
        ],
      }),
    });
    mockApplyResolveOptions.mockResolvedValue({
      repliedThreads: ["t-human"],
      resolvedThreads: [],
      minimizedComments: [],
      dismissedReviews: [],
      errors: [],
    });

    await runResolveMutate({
      ...BASE_OPTS,
      replyThreadIds: ["t-human"],
      dismissMessage: "done",
    });

    expect(mockMarkReplySeen).toHaveBeenCalledWith(
      { owner: "owner", repo: "repo", pr: 42 },
      "t-human",
      "top body",
      `top body\n\n--- thread comment ---\n\n${addPrShepherdMarker("done")}`,
      addPrShepherdMarker("done"),
    );
  });
});
