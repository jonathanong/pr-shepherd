import { describe, it, expect } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  makeComment,
  makeThread,
  mockApplyResolveOptions,
  mockFetchPrBatch,
  mockLoadConfig,
} from "../../test-helpers/commands/resolve.test-support.mts";
import { runResolveMutate } from "./resolve.mts";

registerHooks();

describe("runResolveMutate — configured bot threads", () => {
  it("treats configured bot thread authors as non-human for mutations", async () => {
    mockLoadConfig.mockReturnValue({
      botUsernames: ["coderabbitai"],
      resolve: { shaPoll: { intervalMs: 2000, maxAttempts: 10 }, fetchReviewSummaries: true },
      actions: { autoResolveOutdated: true, autoMarkReady: true, commitSuggestions: true },
      iterate: {
        fixAttemptsPerThread: 3,
        stallTimeoutMinutes: 60,
        minimizeApprovals: false,
        minimizeComments: "all",
      },
      watch: { readyDelayMinutes: 10 },
      checks: { ciTriggerEvents: ["pull_request", "pull_request_target"] },
      mergeStatus: { blockingReviewerLogins: ["copilot"] },
    });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        comments: [
          makeComment({
            id: "c-coderabbit",
            author: "CodeRabbitAI",
            authorType: "User",
            body: "bot",
          }),
        ],
        changesRequestedReviews: [
          { id: "r-coderabbit", author: "CodeRabbitAI", authorType: "User", body: "bot" },
        ],
        reviewThreads: [
          makeThread({
            id: "t-coderabbit",
            author: "CodeRabbitAI",
            authorType: "User",
          }),
        ],
      }),
    });

    const result = await runResolveMutate({
      ...BASE_OPTS,
      resolveThreadIds: ["t-coderabbit"],
      replyThreadIds: ["t-coderabbit"],
      minimizeCommentIds: ["c-coderabbit"],
      dismissReviewIds: ["r-coderabbit"],
      dismissMessage: "done",
    });

    expect(mockApplyResolveOptions).toHaveBeenCalledWith(
      42,
      { owner: "owner", name: "repo" },
      expect.objectContaining({
        resolveThreadIds: ["t-coderabbit"],
        replyThreadIds: [],
        minimizeCommentIds: ["c-coderabbit"],
        dismissReviewIds: ["r-coderabbit"],
      }),
    );
    expect(result.skippedNonHumanReplies).toEqual(["t-coderabbit"]);
  });
});
