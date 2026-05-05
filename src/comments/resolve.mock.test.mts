import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock github/client.mts before any imports.
// ---------------------------------------------------------------------------

vi.mock("../github/client.mts", () => ({
  graphqlWithRateLimit: vi.fn(),
  getPrHeadSha: vi.fn(),
}));

import { applyResolveOptions, autoResolveOutdated } from "./resolve.mts";
import { graphqlWithRateLimit, getPrHeadSha } from "../github/client.mts";

const mockGraphql = vi.mocked(graphqlWithRateLimit);
const mockGetPrHeadSha = vi.mocked(getPrHeadSha);

const REPO = { owner: "owner", name: "repo" };

/** Build a mock response with the correct nested shape for each alias type (r/m/d). */
function makeBulkResponse(doc: unknown): { data: Record<string, unknown> } {
  const str = typeof doc === "string" ? doc : "";
  const data: Record<string, unknown> = {};
  for (const [, alias] of str.matchAll(/^\s+([a-z]\d+):/gm)) {
    if (alias!.startsWith("r")) data[alias!] = { thread: { isResolved: true } };
    else if (alias!.startsWith("m")) data[alias!] = { minimizedComment: { isMinimized: true } };
    else if (alias!.startsWith("d")) data[alias!] = { pullRequestReview: { state: "DISMISSED" } };
    else data[alias!] = {};
  }
  return { data };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGraphql.mockImplementation(async (doc) => makeBulkResponse(doc));
});

// ---------------------------------------------------------------------------
// applyResolveOptions
// ---------------------------------------------------------------------------

describe("applyResolveOptions — validation", () => {
  it("throws synchronously when dismissing without --message", async () => {
    await expect(applyResolveOptions(1, REPO, { dismissReviewIds: ["r-1"] })).rejects.toThrow(
      "--message is required",
    );
  });
});

describe("applyResolveOptions — mutations", () => {
  it("resolves threads and populates resolvedThreads", async () => {
    const result = await applyResolveOptions(1, REPO, { resolveThreadIds: ["t-1", "t-2"] });
    expect(result.resolvedThreads).toEqual(["t-1", "t-2"]);
    expect(result.errors).toHaveLength(0);
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

// ---------------------------------------------------------------------------
// autoResolveOutdated
// ---------------------------------------------------------------------------

describe("autoResolveOutdated", () => {
  it("returns resolved IDs and empty errors on success", async () => {
    const ids = ["t-1", "t-2", "t-3"];
    const { resolved, errors } = await autoResolveOutdated(ids);
    expect(resolved).toEqual(ids);
    expect(errors).toHaveLength(0);
  });

  it("splits mutations into 10-op graphql calls", async () => {
    const ids = Array.from({ length: 25 }, (_, i) => `t-${i}`);
    await autoResolveOutdated(ids);
    expect(mockGraphql).toHaveBeenCalledTimes(3);
    const doc = mockGraphql.mock.calls[0]?.[0] as string;
    expect(doc).toContain("mutation BulkApply");
    for (const id of ids.slice(0, 10)) {
      expect(doc).toContain(id);
    }
    expect(doc).not.toContain("t-10");
  });
});

// ---------------------------------------------------------------------------
// waitForSha (via requireSha option)
// ---------------------------------------------------------------------------

describe("applyResolveOptions — requireSha", () => {
  it("proceeds immediately when SHA matches on first poll", async () => {
    mockGetPrHeadSha.mockResolvedValue("abc123");
    const result = await applyResolveOptions(1, REPO, {
      resolveThreadIds: ["t-1"],
      requireSha: "abc123",
    });
    expect(result.resolvedThreads).toEqual(["t-1"]);
    expect(mockGetPrHeadSha).toHaveBeenCalledTimes(1);
  });

  it("throws 'Push may still be in transit' after max attempts", async () => {
    vi.useFakeTimers();
    try {
      mockGetPrHeadSha.mockResolvedValue("old-sha");
      // Attach error handler immediately so the rejection is never "unhandled".
      const settledPromise = applyResolveOptions(1, REPO, {
        resolveThreadIds: [],
        requireSha: "expected-sha",
      }).catch((e: unknown) => e as Error);
      // shaPoll.maxAttempts=10, intervalMs=2000 → 9 intervals × 2000ms = 18s
      await vi.runAllTimersAsync();
      const caught = await settledPromise;
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toContain("Push may still be in transit");
    } finally {
      vi.useRealTimers();
    }
  });
});
