import { describe, it, expect } from "vitest";
import {
  registerHooks,
  REPO,
  makeRawPr,
  makeResponse,
  mockGraphqlWithRateLimit,
} from "../../test-helpers/github/batch-parsers.test-support.mts";
import { fetchPrBatch } from "./batch.mts";

registerHooks();

describe("fetchPrBatch — null author fallbacks", () => {
  it("defaults latestReview author to 'unknown' when null", async () => {
    const pr = makeRawPr({
      latestReviews: { nodes: [{ author: null, state: "APPROVED" }] },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.latestReviews[0]!.login).toBe("unknown");
  });

  it("defaults comment author to 'unknown' when null", async () => {
    const pr = makeRawPr({
      comments: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [
          {
            id: "c-1",
            isMinimized: false,
            author: null,
            body: "hello",
            createdAt: "2024-01-01T00:00:00Z",
          },
        ],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.comments[0]!.author).toBe("unknown");
  });

  it("defaults changesRequestedReview author to 'unknown' when null", async () => {
    const pr = makeRawPr({
      changesRequestedReviews: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [{ id: "r-1", author: null, body: "needs work" }],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.changesRequestedReviews[0]!.author).toBe("unknown");
  });

  it("maps reviewDecision: null to null", async () => {
    const pr = makeRawPr({ reviewDecision: null });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.reviewDecision).toBeNull();
  });

  it("maps headRepository: null to headRepoWithOwner: null (deleted fork)", async () => {
    const pr = makeRawPr({ headRepository: null });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.headRepoWithOwner).toBeNull();
  });

  it("maps headRepository.nameWithOwner to headRepoWithOwner", async () => {
    const pr = makeRawPr({ headRepository: { nameWithOwner: "contributor/fork" } });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.headRepoWithOwner).toBe("contributor/fork");
  });
});
