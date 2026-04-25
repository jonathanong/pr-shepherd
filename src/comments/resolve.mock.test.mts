import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock github/client.mts before any imports.
// ---------------------------------------------------------------------------

vi.mock("../github/client.mts", () => ({
  graphql: vi.fn(),
  getPrHeadSha: vi.fn(),
}));

import { applyResolveOptions, autoResolveOutdated } from "./resolve.mts";
import { graphql, getPrHeadSha } from "../github/client.mts";

const mockGraphql = vi.mocked(graphql);
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
    mockGraphql.mockRejectedValueOnce(new Error("rate limited"));
    const result = await applyResolveOptions(1, REPO, { resolveThreadIds: ["t-bad"] });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("t-bad:");
    expect(result.errors[0]).toContain("rate limited");
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

  it("issues a single bulk graphql call for any number of ids", async () => {
    const ids = Array.from({ length: 20 }, (_, i) => `t-${i}`);
    await autoResolveOutdated(ids);
    expect(mockGraphql).toHaveBeenCalledTimes(1);
    const doc = mockGraphql.mock.calls[0]?.[0] as string;
    expect(doc).toContain("mutation BulkApply");
    // All 20 IDs should appear inline.
    for (const id of ids) {
      expect(doc).toContain(id);
    }
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
