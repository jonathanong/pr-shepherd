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

describe("fetchPrBatch — changesRequestedReviews dedup via latestReviews", () => {
  it("drops a CR review when the same author's latest review is APPROVED", async () => {
    const pr = makeRawPr({
      latestReviews: {
        nodes: [{ author: { __typename: "Bot", login: "coderabbitai[bot]" }, state: "APPROVED" }],
      },
      changesRequestedReviews: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [
          {
            id: "PRR_CR_1",
            author: { __typename: "Bot", login: "coderabbitai[bot]" },
            body: "please fix this",
          },
        ],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.changesRequestedReviews).toHaveLength(0);
  });

  it("drops a CR review when the same author's latest review is DISMISSED", async () => {
    const pr = makeRawPr({
      latestReviews: {
        nodes: [{ author: { __typename: "User", login: "alice" }, state: "DISMISSED" }],
      },
      changesRequestedReviews: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [{ id: "PRR_CR_2", author: { __typename: "User", login: "alice" }, body: "stale" }],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.changesRequestedReviews).toHaveLength(0);
  });

  it("keeps a CR review when the author has no subsequent APPROVED/DISMISSED review", async () => {
    const pr = makeRawPr({
      latestReviews: {
        nodes: [{ author: { __typename: "User", login: "bob" }, state: "CHANGES_REQUESTED" }],
      },
      changesRequestedReviews: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [
          { id: "PRR_CR_3", author: { __typename: "User", login: "bob" }, body: "fix the tests" },
        ],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.changesRequestedReviews).toHaveLength(1);
    expect(data.changesRequestedReviews[0]!.id).toBe("PRR_CR_3");
  });

  it("keeps the CR from one author and drops the CR from another who later approved", async () => {
    const pr = makeRawPr({
      latestReviews: {
        nodes: [
          { author: { __typename: "User", login: "alice" }, state: "APPROVED" },
          { author: { __typename: "User", login: "bob" }, state: "CHANGES_REQUESTED" },
        ],
      },
      changesRequestedReviews: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [
          { id: "PRR_CR_A", author: { __typename: "User", login: "alice" }, body: "old cr" },
          {
            id: "PRR_CR_B",
            author: { __typename: "User", login: "bob" },
            body: "still needs work",
          },
        ],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.changesRequestedReviews).toHaveLength(1);
    expect(data.changesRequestedReviews[0]!.id).toBe("PRR_CR_B");
  });
});
