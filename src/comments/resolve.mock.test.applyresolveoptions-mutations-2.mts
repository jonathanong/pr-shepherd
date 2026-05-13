// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerHooks, REPO, applyResolveOptions, mockGraphql } from "./resolve.test-support.mts";

registerHooks();

describe("applyResolveOptions — mutations", () => {
  it("preserves current-batch alias failures when only headers show remaining zero", async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `c-${i}`);
    mockGraphql.mockResolvedValueOnce({
      data: {
        m0: { minimizedComment: { isMinimized: true } },
        m1: null,
        m2: { minimizedComment: { isMinimized: true } },
        m3: { minimizedComment: { isMinimized: true } },
        m4: { minimizedComment: { isMinimized: true } },
        m5: { minimizedComment: { isMinimized: true } },
        m6: { minimizedComment: { isMinimized: true } },
        m7: { minimizedComment: { isMinimized: true } },
        m8: { minimizedComment: { isMinimized: true } },
        m9: { minimizedComment: { isMinimized: true } },
      },
      rateLimit: { remaining: 0, limit: 5000, resetAt: 1700000000 },
    });

    const result = await applyResolveOptions(1, REPO, { minimizeCommentIds: ids });

    expect(result.errors).toContain("c-1: minimize returned null or comment not minimized");
    expect(result.unminimizedComments).toEqual(["c-1", "c-10", "c-11"]);
  });
  it("records error when resolve alias returns non-resolved thread", async () => {
    mockGraphql.mockResolvedValueOnce({ data: { r0: { thread: { isResolved: false } } } });
    const result = await applyResolveOptions(1, REPO, { resolveThreadIds: ["t-1"] });
    expect(result.resolvedThreads).toHaveLength(0);
    expect(result.errors[0]).toContain("t-1");
    expect(result.errors[0]).toContain("not resolved");
  });
  it("records error when minimize alias returns null minimizedComment", async () => {
    mockGraphql.mockResolvedValueOnce({ data: { m0: { minimizedComment: null } } });
    const result = await applyResolveOptions(1, REPO, { minimizeCommentIds: ["c-1"] });
    expect(result.minimizedComments).toHaveLength(0);
    expect(result.errors[0]).toContain("c-1");
    expect(result.errors[0]).toContain("not minimized");
  });
  it("records error when dismiss alias returns null pullRequestReview", async () => {
    mockGraphql.mockResolvedValueOnce({ data: { d0: null } });
    const result = await applyResolveOptions(1, REPO, {
      dismissReviewIds: ["r-1"],
      dismissMessage: "addressed",
    });
    expect(result.dismissedReviews).toHaveLength(0);
    expect(result.errors[0]).toContain("r-1");
  });
});
