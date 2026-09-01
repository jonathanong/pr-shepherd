import { describe, expect, it } from "vitest";
import {
  BASE_OPTS,
  makeBatchData,
  makeThread,
  mockApplyResolveOptions,
  mockFetchPrBatch,
  registerHooks,
} from "../../test-helpers/commands/resolve.test-support.mts";
import { runResolveMutate } from "./resolve.mts";

registerHooks();

describe("runResolveMutate — explicit intent", () => {
  it("forwards minimization for fetched review summaries and approvals", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewSummaries: [
          {
            id: "summary-ok",
            author: "bot[bot]",
            authorType: "Bot",
            body: "summary",
            viewerCanMinimize: true,
          },
        ],
        approvedReviews: [
          {
            id: "approval-ok",
            author: "bot[bot]",
            authorType: "Bot",
            body: "approval",
            viewerCanMinimize: true,
          },
        ],
      }),
    });

    await runResolveMutate({
      ...BASE_OPTS,
      minimizeCommentIds: ["summary-ok", "approval-ok"],
    });

    expect(mockApplyResolveOptions).toHaveBeenCalledWith(
      42,
      { owner: "owner", name: "repo" },
      expect.objectContaining({ minimizeCommentIds: ["summary-ok", "approval-ok"] }),
    );
  });

  it("forwards a requested human reply without rechecking authorization", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewThreads: [
          makeThread({
            id: "t-denied",
            authorType: "User",
            viewerDidAuthor: true,
            viewerCanReply: false,
          }),
        ],
      }),
    });

    await runResolveMutate({
      ...BASE_OPTS,
      replyThreadIds: ["t-denied"],
      dismissMessage: "done",
    });

    expect(mockApplyResolveOptions).toHaveBeenCalledWith(
      42,
      { owner: "owner", name: "repo" },
      expect.objectContaining({ replyThreadIds: ["t-denied"] }),
    );
  });
});
