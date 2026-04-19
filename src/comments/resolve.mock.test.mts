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

beforeEach(() => {
  vi.clearAllMocks();
  mockGraphql.mockResolvedValue({ data: {} });
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
    // Verify the mutation var shape
    const callArgs = mockGraphql.mock.calls.find(
      (c) => (c[1] as Record<string, unknown>)?.["commentId"] === "c-1",
    );
    expect(callArgs).toBeDefined();
    expect((callArgs![1] as Record<string, unknown>)["classifier"]).toBe("RESOLVED");
  });

  it("dismisses reviews with provided message", async () => {
    const result = await applyResolveOptions(1, REPO, {
      dismissReviewIds: ["r-1"],
      dismissMessage: "addressed in follow-up",
    });
    expect(result.dismissedReviews).toEqual(["r-1"]);
    const callArgs = mockGraphql.mock.calls.find(
      (c) => (c[1] as Record<string, unknown>)?.["reviewId"] === "r-1",
    );
    expect((callArgs![1] as Record<string, unknown>)["message"]).toBe("addressed in follow-up");
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

  it("batches by CONCURRENCY (default 4) — correct graphql call count for 20 ids", async () => {
    const ids = Array.from({ length: 20 }, (_, i) => `t-${i}`);
    await autoResolveOutdated(ids);
    // One graphql call per id.
    expect(mockGraphql).toHaveBeenCalledTimes(20);
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
    vi.useRealTimers();
  });
});
