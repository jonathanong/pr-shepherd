// @ts-nocheck
/* eslint-disable max-lines */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerHooks, REPO, makeBulkResponse, mockGraphql } from "./resolve.test-support.mts";
import { applyResolveOptions } from "./resolve.mts";

registerHooks();

describe("applyResolveOptions — mutations", () => {
  it("resolves threads and populates resolvedThreads", async () => {
    const result = await applyResolveOptions(1, REPO, { resolveThreadIds: ["t-1", "t-2"] });
    expect(result.resolvedThreads).toEqual(["t-1", "t-2"]);
    expect(result.errors).toHaveLength(0);
  });
  it("dedupes resolve thread IDs", async () => {
    const result = await applyResolveOptions(1, REPO, { resolveThreadIds: ["t-1", "t-1"] });
    expect(result.resolvedThreads).toEqual(["t-1"]);
    expect(result.errors).toHaveLength(0);
    const doc = mockGraphql.mock.calls[0]?.[0] as string;
    expect(doc).toContain('r0: resolveReviewThread(input: { threadId: "t-1" })');
    expect(doc).not.toContain('r1: resolveReviewThread(input: { threadId: "t-1" })');
  });
  it("minimizes comments with classifier RESOLVED", async () => {
    const result = await applyResolveOptions(1, REPO, { minimizeCommentIds: ["c-1"] });
    expect(result.minimizedComments).toEqual(["c-1"]);
    // Verify classifier and ID are inlined in the mutation document.
    const doc = mockGraphql.mock.calls[0]?.[0] as string;
    expect(doc).toContain("c-1");
    expect(doc).toContain("classifier: RESOLVED");
  });
  it("dismisses reviews with provided message", async () => {
    const result = await applyResolveOptions(1, REPO, {
      dismissReviewIds: ["r-1"],
      dismissMessage: "addressed in follow-up",
    });
    expect(result.dismissedReviews).toEqual(["r-1"]);
    // Verify the review ID and message are inlined in the mutation document.
    const doc = mockGraphql.mock.calls[0]?.[0] as string;
    expect(doc).toContain("r-1");
    expect(doc).toContain("addressed in follow-up");
  });
  it("ignores dismiss IDs that are already in minimize-comment-ids", async () => {
    const result = await applyResolveOptions(1, REPO, {
      minimizeCommentIds: ["PRR_1"],
      dismissReviewIds: ["PRR_1", "PRR_2"],
      dismissMessage: "addressed in follow-up",
    });

    expect(result.dismissedReviews).toEqual(["PRR_2"]);
    expect(result.skippedDismissals).toEqual(["PRR_1"]);
    expect(result.errors).toEqual([]);
    const doc = mockGraphql.mock.calls[0]?.[0] as string;
    expect(doc).toContain(
      'm0: minimizeComment(input: { subjectId: "PRR_1", classifier: RESOLVED })',
    );
    expect(doc).toContain(
      'd0: dismissPullRequestReview(input: { pullRequestReviewId: "PRR_2", message: "addressed in follow-up" })',
    );
    expect(doc).not.toContain(
      'd0: dismissPullRequestReview(input: { pullRequestReviewId: "PRR_1",',
    );
  });
  it("does not require --message when all dismiss IDs are also minimize IDs", async () => {
    const result = await applyResolveOptions(1, REPO, {
      minimizeCommentIds: ["PRR_1"],
      dismissReviewIds: ["PRR_1"],
    });
    expect(result.dismissedReviews).toEqual([]);
    expect(result.skippedDismissals).toEqual(["PRR_1"]);
    expect(result.errors).toEqual([]);
  });
  it("returns actionable guidance when GitHub rejects dismissing a COMMENTED review", async () => {
    mockGraphql.mockResolvedValueOnce({
      data: { d0: null },
      errors: [{ message: "Can not dismiss a commented pull request review", path: ["d0"] }],
    });

    const result = await applyResolveOptions(1, REPO, {
      dismissReviewIds: ["PRR_1"],
      dismissMessage: "done",
    });

    expect(result.dismissedReviews).toEqual([]);
    expect(result.errors).toEqual([
      "Not dismissed: PRR_1 is a COMMENTED review. Use --minimize-comment-ids instead; --dismiss-review-ids is only for CHANGES_REQUESTED reviews.",
    ]);
  });
  it("attributes COMMENTED review dismiss errors to only the matching dismiss operation", async () => {
    mockGraphql.mockResolvedValueOnce({
      data: { d0: null, d1: null },
      errors: [
        { message: "Invalid review state for dismissal", path: ["d0", "dismissPullRequestReview"] },
        {
          message: "Can not dismiss a commented pull request review",
          path: ["d1", "dismissPullRequestReview"],
        },
      ],
    });

    const result = await applyResolveOptions(1, REPO, {
      dismissReviewIds: ["PRR_1", "PRR_2"],
      dismissMessage: "done",
    });

    expect(result.dismissedReviews).toEqual([]);
    expect(result.errors).toEqual([
      "PRR_1: dismiss returned null",
      "Not dismissed: PRR_2 is a COMMENTED review. Use --minimize-comment-ids instead; --dismiss-review-ids is only for CHANGES_REQUESTED reviews.",
    ]);
  });
  it("continues COMMENTED error attribution across mixed mapped and unmapped errors", async () => {
    mockGraphql.mockResolvedValueOnce({
      data: { d0: null, d1: null },
      errors: [
        { message: "Can not dismiss a commented pull request review" },
        {
          message: "Can not dismiss a commented pull request review",
          path: ["d1", "dismissPullRequestReview"],
        },
      ],
    });

    const result = await applyResolveOptions(1, REPO, {
      dismissReviewIds: ["PRR_1", "PRR_2"],
      dismissMessage: "done",
    });

    expect(result.dismissedReviews).toEqual([]);
    expect(result.errors).toEqual([
      "PRR_1: dismiss returned null",
      "Not dismissed: PRR_2 is a COMMENTED review. Use --minimize-comment-ids instead; --dismiss-review-ids is only for CHANGES_REQUESTED reviews.",
    ]);
  });
  it("treats malformed commented-dismiss path entries as overlapping aliases for single dismiss attempts", async () => {
    mockGraphql.mockResolvedValueOnce({
      data: { d0: null },
      errors: [
        {
          message: "Can not dismiss a commented pull request review",
          path: [0],
        },
      ],
    });

    const result = await applyResolveOptions(1, REPO, {
      dismissReviewIds: ["PRR_1"],
      dismissMessage: "done",
    });

    expect(result.dismissedReviews).toEqual([]);
    expect(result.errors).toEqual([
      "Not dismissed: PRR_1 is a COMMENTED review. Use --minimize-comment-ids instead; --dismiss-review-ids is only for CHANGES_REQUESTED reviews.",
    ]);
  });
  it("collects errors as 'id: message' without throwing", async () => {
    mockGraphql.mockRejectedValueOnce(new Error("server unavailable"));
    const result = await applyResolveOptions(1, REPO, { resolveThreadIds: ["t-bad"] });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("t-bad:");
    expect(result.errors[0]).toContain("server unavailable");
  });
  it("does not classify non-rate-limit 403 errors as retryable rate limits", async () => {
    mockGraphql.mockRejectedValueOnce(
      Object.assign(new Error("Resource not accessible by integration"), { status: 403 }),
    );

    const result = await applyResolveOptions(1, REPO, {
      minimizeCommentIds: ["c-bad", "c-later"],
    });

    expect(result.rateLimit).toBeUndefined();
    expect(result.unminimizedComments).toBeUndefined();
    expect(result.errors).toEqual([
      "c-bad: Resource not accessible by integration",
      "c-later: Resource not accessible by integration",
    ]);
  });
  it("does not classify retry-after alone as a rate-limit stop without rate-limit status", async () => {
    mockGraphql.mockRejectedValueOnce(
      Object.assign(new Error("Service unavailable"), {
        status: 503,
        retryAfterSeconds: 30,
      }),
    );

    const result = await applyResolveOptions(1, REPO, { resolveThreadIds: ["t-1"] });

    expect(result.rateLimit).toBeUndefined();
    expect(result.unresolvedThreads).toBeUndefined();
    expect(result.errors).toEqual(["t-1: Service unavailable"]);
  });
  it("classifies retry-after with a rate-limit status as a rate-limit stop", async () => {
    mockGraphql.mockRejectedValueOnce(
      Object.assign(new Error("Forbidden"), {
        status: 403,
        retryAfterSeconds: 30,
      }),
    );

    const result = await applyResolveOptions(1, REPO, { resolveThreadIds: ["t-1", "t-2"] });

    expect(result.rateLimit).toMatchObject({ message: "Forbidden", retryAfterSeconds: 30 });
    expect(result.unresolvedThreads).toEqual(["t-1", "t-2"]);
    expect(result.errors).toEqual(["rate limit: Forbidden"]);
  });
  it("stops on a thrown rate limit and reports unattempted IDs", async () => {
    const ids = Array.from({ length: 25 }, (_, i) => `c-${i}`);
    mockGraphql
      .mockImplementationOnce(async (doc) => makeBulkResponse(doc))
      .mockRejectedValueOnce(
        Object.assign(new Error("API rate limit exceeded"), {
          status: 403,
          retryAfterSeconds: 60,
          rateLimit: { remaining: 0, limit: 5000, resetAt: 1700000000 },
        }),
      );

    const result = await applyResolveOptions(1, REPO, { minimizeCommentIds: ids });

    expect(mockGraphql).toHaveBeenCalledTimes(2);
    expect(result.minimizedComments).toEqual(ids.slice(0, 10));
    expect(result.unminimizedComments).toEqual(ids.slice(10));
    expect(result.rateLimit).toMatchObject({
      message: "API rate limit exceeded",
      retryAfterSeconds: 60,
      remaining: 0,
      limit: 5000,
      resetAt: 1700000000,
    });
  });
  it("records partial successes from a GraphQL response before stopping on rate-limit errors", async () => {
    const ids = Array.from({ length: 15 }, (_, i) => `c-${i}`);
    mockGraphql.mockResolvedValueOnce({
      data: {
        m0: { minimizedComment: { isMinimized: true } },
        m1: { minimizedComment: { isMinimized: true } },
        m2: null,
        m3: null,
        m4: null,
        m5: null,
        m6: null,
        m7: null,
        m8: null,
        m9: null,
      },
      errors: [{ message: "You have exceeded a secondary rate limit" }],
      rateLimit: { remaining: 10, limit: 5000, resetAt: 1700000000 },
    });

    const result = await applyResolveOptions(1, REPO, { minimizeCommentIds: ids });

    expect(mockGraphql).toHaveBeenCalledTimes(1);
    expect(result.minimizedComments).toEqual(["c-0", "c-1"]);
    expect(result.unminimizedComments).toEqual(ids.slice(2));
    expect(result.errors).toEqual(["rate limit: You have exceeded a secondary rate limit"]);
  });
  it("stops before the next batch when remaining rate-limit budget reaches zero", async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `c-${i}`);
    mockGraphql.mockResolvedValueOnce({
      ...makeBulkResponse("  m0:\n  m1:\n  m2:\n  m3:\n  m4:\n  m5:\n  m6:\n  m7:\n  m8:\n  m9:"),
      rateLimit: { remaining: 0, limit: 5000, resetAt: 1700000000 },
    });

    const result = await applyResolveOptions(1, REPO, { minimizeCommentIds: ids });

    expect(mockGraphql).toHaveBeenCalledTimes(1);
    expect(result.minimizedComments).toEqual(ids.slice(0, 10));
    expect(result.unminimizedComments).toEqual(ids.slice(10));
    expect(result.rateLimit?.message).toContain("remaining is 0");
  });
});
