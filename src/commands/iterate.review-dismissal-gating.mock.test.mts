import { describe, it, expect } from "vitest";
import {
  registerIterateHooks,
  makeOpts,
  makeReport,
  makeReview,
  mockAutoMinimizeComments,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "../../test-helpers/commands/iterate-test-support.mts";
import type { ReviewThread } from "../types.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

const WAIT_DELAY = { isReady: false, shouldCancel: false, remainingSeconds: 600 };

function makeThread(overrides: Partial<ReviewThread> & { id: string }): ReviewThread {
  return {
    isResolved: false,
    isOutdated: false,
    isMinimized: false,
    viewerCanReply: true,
    viewerCanResolve: true,
    path: "src/foo.mts",
    line: 10,
    startLine: null,
    author: "coderabbitai",
    authorType: "Bot",
    body: "Please fix this.",
    url: "https://github.com/owner/repo/pull/42#discussion_r1",
    createdAtUnix: 100,
    ...overrides,
  };
}

describe("review dismissal gating and separate dismissReviewsCommand", () => {
  it("does not dismiss or minimize a bot CHANGES_REQUESTED review while its inline threads are unresolved", async () => {
    const cr = {
      id: "PRR_CR_1",
      author: "coderabbitai",
      authorType: "Bot" as const,
      viewerCanMinimize: true,
      body: "Actionable comments posted: 1",
    };
    const childThread = makeThread({ id: "PRRT_child_1", reviewId: "PRR_CR_1" });
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        changesRequestedReviews: [cr],
        threads: {
          actionable: [childThread],
          resolutionOnly: [],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [],
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue(WAIT_DELAY);

    const result = await runIterate(makeOpts());
    expect(result.action).toBe("triage");
    if (result.action !== "triage") return;

    expect(result.triage.resolveCommand.replyThreadIds).toEqual(["PRRT_child_1"]);
    expect(result.triage.resolveCommand.resolveThreadIds).toEqual(["PRRT_child_1"]);
    expect(result.triage.resolveCommand.argv).not.toContain("--dismiss-review-ids");
    expect(result.triage.resolveCommand.argv).not.toContain("PRR_CR_1");
    expect(result.triage.dismissReviewsCommand).toBeUndefined();
  });

  it("dismisses AND minimizes a bot CHANGES_REQUESTED review in a separate command once its inline threads resolve", async () => {
    const cr = {
      id: "PRR_CR_1",
      author: "coderabbitai",
      authorType: "Bot" as const,
      viewerCanMinimize: true,
      body: "Actionable comments posted: 1",
      staleBotCr: true,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({ status: "UNRESOLVED_COMMENTS", changesRequestedReviews: [cr] }),
    );
    mockUpdateReadyDelay.mockResolvedValue(WAIT_DELAY);

    const result = await runIterate(makeOpts());
    expect(result.action).toBe("triage");
    if (result.action !== "triage") return;

    expect(result.triage.resolveCommand.hasMutations).toBe(false);
    expect(result.triage.dismissReviewsCommand?.argv).toContain("--dismiss-review-ids");
    expect(result.triage.dismissReviewsCommand?.argv).toContain("--minimize-comment-ids");
    expect(result.triage.dismissReviewsCommand?.argv).toContain("PRR_CR_1");
    expect(result.triage.dismissReviewsCommand?.requiresHeadSha).toBe(true);
    expect(result.triage.dismissReviewsCommand?.requiresDismissMessage).toBe(true);
  });

  it("keeps reviews blocked via unresolvedThreadReviewIds out of dismissReviewsCommand", async () => {
    const cr = {
      id: "PRR_CR_BLOCKED",
      author: "coderabbitai",
      authorType: "Bot" as const,
      viewerCanMinimize: true,
      body: "Summary",
    };
    const summary = {
      ...makeReview("PRR_SUM_BLOCKED", "coderabbitai", "Comment summary"),
      authorType: "Bot" as const,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        changesRequestedReviews: [cr],
        reviewSummaries: [summary],
        unresolvedThreadReviewIds: ["PRR_CR_BLOCKED", "PRR_SUM_BLOCKED"],
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue(WAIT_DELAY);

    const result = await runIterate(makeOpts());
    expect(result.action).toBe("triage");
    if (result.action !== "triage") return;

    expect(mockAutoMinimizeComments).not.toHaveBeenCalled();
    expect(result.triage.reviewSummaryIds).toEqual([]);
    expect(result.triage.dismissReviewsCommand).toBeUndefined();
  });

  it("emits thread mutations and resolved-review dismissal as separate commands when both exist", async () => {
    const resolvedCr = {
      id: "PRR_CR_READY",
      author: "coderabbitai",
      authorType: "Bot" as const,
      viewerCanMinimize: true,
      body: "Old CR with all threads resolved",
    };
    const resolvedCommentReview = {
      ...makeReview("PRR_SUM_READY", "coderabbitai", "Comment review with all threads resolved"),
      authorType: "Bot" as const,
    };
    const unrelatedThread = makeThread({ id: "PRRT_other", reviewId: "PRR_OTHER_ACTIVE" });
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        changesRequestedReviews: [resolvedCr],
        reviewSummaries: [resolvedCommentReview],
        threads: {
          actionable: [unrelatedThread],
          resolutionOnly: [],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [],
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue(WAIT_DELAY);

    const result = await runIterate(makeOpts());
    expect(result.action).toBe("triage");
    if (result.action !== "triage") return;

    expect(result.triage.resolveCommand.argv).toContain("PRRT_other");
    expect(result.triage.resolveCommand.argv).not.toContain("PRR_CR_READY");
    expect(result.triage.resolveCommand.argv).not.toContain("PRR_SUM_READY");

    expect(result.triage.dismissReviewsCommand?.argv).toContain("--dismiss-review-ids");
    expect(result.triage.dismissReviewsCommand?.argv).toContain("PRR_CR_READY");
    const minIdx =
      result.triage.dismissReviewsCommand?.argv.indexOf("--minimize-comment-ids") ?? -1;
    expect(minIdx).toBeGreaterThan(-1);
    expect(result.triage.dismissReviewsCommand?.argv[minIdx + 1]).toBe(
      "PRR_CR_READY,PRR_SUM_READY",
    );
  });
});
