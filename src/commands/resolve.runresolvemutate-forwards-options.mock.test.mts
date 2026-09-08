import { describe, it, expect } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  mockApplyResolveOptions,
  mockFetchPrBatch,
  mockMarkReplySeen,
  makeBatchData,
  makeThread,
} from "../../test-helpers/commands/resolve.test-support.mts";
import { runResolveMutate } from "./resolve.mts";
import { addPrShepherdMarker } from "../comments/marker.mts";

registerHooks();

describe("runResolveMutate — forwards options", () => {
  it("forwards every requested mutation ID without fetching current review state", async () => {
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
        dismissReviewIds: ["r-1"],
        dismissMessage: "done",
        requireSha: "sha-abc",
      }),
    );
    expect(firstResult.skippedDismissals).toBeUndefined();
    expect(mockFetchPrBatch).not.toHaveBeenCalled();
  });

  it("forwards human and non-human IDs without author policy filtering", async () => {
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
        resolveThreadIds: ["t-human", "t-bot"],
        minimizeCommentIds: ["c-human", "c-bot"],
        dismissReviewIds: ["r-human", "r-bot"],
      }),
    );
    expect(result.skippedHumanResolves).toBeUndefined();
    expect(result.skippedHumanMinimizes).toBeUndefined();
    expect(result.skippedHumanDismissals).toBeUndefined();
  });

  it("forwards every requested reply ID without using the current batch as a filter", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ reviewThreads: [makeThread({ id: "t-human" })] }),
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
        replyThreadIds: ["t-human", "t-bot", "t-typo"],
      }),
    );
    expect(result.skippedNonHumanReplies).toBeUndefined();
  });

  it("still forwards replies when best-effort transcript fetching fails", async () => {
    mockFetchPrBatch.mockRejectedValueOnce(new Error("read failed"));

    await runResolveMutate({
      ...BASE_OPTS,
      replyThreadIds: ["t-human"],
      dismissMessage: "done",
    });

    expect(mockApplyResolveOptions).toHaveBeenCalledWith(
      42,
      { owner: "owner", name: "repo" },
      expect.objectContaining({ replyThreadIds: ["t-human"] }),
    );
    expect(mockMarkReplySeen).not.toHaveBeenCalled();
  });

  it("records the successful reply marker without using it to decide the reply", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewThreads: [
          makeThread({
            id: "t-human",
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
