// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerHooks,
  REPO,
  makeRawPr,
  makeResponse,
  mockGraphqlWithRateLimit,
} from "./batch-parsers.test-support.mts";
import { fetchPrBatch } from "./batch.mts";

registerHooks();

describe("fetchPrBatch — team reviewer fallback", () => {
  it("uses name when login is absent (team reviewer)", async () => {
    const pr = makeRawPr({
      reviewRequests: {
        nodes: [{ requestedReviewer: { name: "my-team" } }],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.reviewRequests[0]!.login).toBe("my-team");
  });

  it("skips reviewRequests with no login or name", async () => {
    const pr = makeRawPr({
      reviewRequests: {
        nodes: [{ requestedReviewer: null }],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.reviewRequests).toHaveLength(0);
  });
});
