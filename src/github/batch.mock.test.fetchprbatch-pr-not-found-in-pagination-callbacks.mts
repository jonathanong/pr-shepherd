// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerHooks,
  REPO,
  fetchPrBatch,
  makeRawPr,
  makeResponse,
  mockGraphql,
  mockGraphqlWithRateLimit,
} from "./batch.test-support.mts";

registerHooks();

describe("fetchPrBatch — PR not found in pagination callbacks", () => {
  it("throws when thread pagination callback receives null PR", async () => {
    const firstPage = makeRawPr({
      reviewThreads: {
        pageInfo: { hasPreviousPage: true, startCursor: "cursor-t" },
        nodes: [{ id: "t-2", isResolved: false, isOutdated: false, comments: { nodes: [] } }],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(firstPage));
    mockGraphql.mockResolvedValue(makeResponse(null));
    await expect(fetchPrBatch(42, REPO)).rejects.toThrow("PR #42 not found");
  });

  it("throws when comment pagination callback receives null PR", async () => {
    const firstPage = makeRawPr({
      comments: {
        pageInfo: { hasPreviousPage: true, startCursor: "cursor-c" },
        nodes: [],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(firstPage));
    mockGraphql.mockResolvedValue(makeResponse(null));
    await expect(fetchPrBatch(42, REPO)).rejects.toThrow("PR #42 not found");
  });

  it("throws when changesRequestedReviews pagination callback receives null PR", async () => {
    const firstPage = makeRawPr({
      changesRequestedReviews: {
        pageInfo: { hasPreviousPage: true, startCursor: "cursor-cr" },
        nodes: [],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(firstPage));
    mockGraphql.mockResolvedValue(makeResponse(null));
    await expect(fetchPrBatch(42, REPO)).rejects.toThrow("PR #42 not found");
  });

  it("throws when reviewSummaries pagination callback receives null PR", async () => {
    const firstPage = makeRawPr({
      reviewSummaries: {
        pageInfo: { hasPreviousPage: true, startCursor: "cursor-rs" },
        nodes: [],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(firstPage));
    mockGraphql.mockResolvedValue(makeResponse(null));
    await expect(fetchPrBatch(42, REPO)).rejects.toThrow("PR #42 not found");
  });
});
