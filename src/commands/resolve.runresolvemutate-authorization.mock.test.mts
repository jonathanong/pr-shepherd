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

describe("runResolveMutate — authorization", () => {
  it("authorizes minimization for fetched review summaries and approvals only", async () => {
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

  it("reports an unauthorized human reply", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewThreads: [makeThread({ id: "t-denied", authorType: "User", viewerCanReply: false })],
      }),
    });

    const result = await runResolveMutate({
      ...BASE_OPTS,
      replyThreadIds: ["t-denied"],
      dismissMessage: "done",
    });

    expect(result.skippedUnauthorizedReplies).toEqual(["t-denied"]);
  });
});
