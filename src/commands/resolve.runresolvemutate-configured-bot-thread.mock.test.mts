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
import { testConfig } from "../../test-helpers/config/test-config.mts";

registerHooks();

describe("runResolveMutate — configured bot threads", () => {
  it("treats configured bot thread authors as non-human for mutations", async () => {
    mockLoadConfig.mockReturnValue(
      testConfig({
        "bot-usernames": ["coderabbitai"],
        iterate: {
          "minimize-comments": "all",
          "ready-delay-minutes": 10,
          instructions: "playbook",
        },
        poll: { "quota-warnings": [] },
        "mark-ready": { "blocking-reviewer-logins": ["copilot"] },
      }),
    );
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

    await runResolveMutate({
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
        replyThreadIds: ["t-coderabbit"],
        minimizeCommentIds: ["c-coderabbit"],
        dismissReviewIds: ["r-coderabbit"],
      }),
    );
  });
});
