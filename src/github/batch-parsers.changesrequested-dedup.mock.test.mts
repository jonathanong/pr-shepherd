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

async function fetchWithConfig(overrides: Parameters<typeof makeRawPr>[0]) {
  mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(makeRawPr(overrides)));
  const { data } = await fetchPrBatch(42, REPO);
  return data;
}

describe("fetchPrBatch — changesRequestedReviews dedup via latestReviews", () => {
  it("drops a CR review when the same author's latest review is APPROVED", async () => {
    const data = await fetchWithConfig({
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
    expect(data.changesRequestedReviews).toHaveLength(0);
  });

  it("drops a CR review when the same author's latest review is DISMISSED", async () => {
    const data = await fetchWithConfig({
      latestReviews: {
        nodes: [{ author: { __typename: "User", login: "alice" }, state: "DISMISSED" }],
      },
      changesRequestedReviews: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [{ id: "PRR_CR_2", author: { __typename: "User", login: "alice" }, body: "stale" }],
      },
    });
    expect(data.changesRequestedReviews).toHaveLength(0);
  });

  it("keeps a CR review when the author has no subsequent APPROVED/DISMISSED review", async () => {
    const data = await fetchWithConfig({
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
    expect(data.changesRequestedReviews).toHaveLength(1);
    expect(data.changesRequestedReviews[0].id).toBe("PRR_CR_3");
  });

  it("keeps the CR from one author and drops the CR from another who later approved", async () => {
    const data = await fetchWithConfig({
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
    expect(data.changesRequestedReviews).toHaveLength(1);
    expect(data.changesRequestedReviews[0].id).toBe("PRR_CR_B");
  });

  it("keeps CR reviews from null-author accounts even if another null-author later approved", async () => {
    const data = await fetchWithConfig({
      latestReviews: {
        nodes: [{ author: null, state: "APPROVED" }],
      },
      changesRequestedReviews: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [{ id: "PRR_CR_NULL", author: null, body: "needs work" }],
      },
    });
    expect(data.changesRequestedReviews).toHaveLength(1);
    expect(data.changesRequestedReviews[0].id).toBe("PRR_CR_NULL");
  });

  it("keeps a CR review when the same author's latest review is PENDING", async () => {
    const data = await fetchWithConfig({
      latestReviews: {
        nodes: [{ author: { __typename: "Bot", login: "copilot[bot]" }, state: "PENDING" }],
      },
      changesRequestedReviews: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [
          {
            id: "PRR_CR_PEND",
            author: { __typename: "Bot", login: "copilot[bot]" },
            body: "issues",
          },
        ],
      },
    });
    expect(data.changesRequestedReviews).toHaveLength(1);
    expect(data.changesRequestedReviews[0].id).toBe("PRR_CR_PEND");
  });

  it("keeps a CR review when the same author's latest review is COMMENTED", async () => {
    const data = await fetchWithConfig({
      latestReviews: {
        nodes: [{ author: { __typename: "User", login: "alice" }, state: "COMMENTED" }],
      },
      changesRequestedReviews: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [
          {
            id: "PRR_CR_CMT",
            author: { __typename: "User", login: "alice" },
            body: "still unresolved",
          },
        ],
      },
    });
    expect(data.changesRequestedReviews).toHaveLength(1);
    expect(data.changesRequestedReviews[0].id).toBe("PRR_CR_CMT");
  });

  it("keeps a CR review when the author does not appear in latestReviews", async () => {
    const data = await fetchWithConfig({
      latestReviews: { nodes: [] },
      changesRequestedReviews: {
        pageInfo: { hasPreviousPage: false, startCursor: null },
        nodes: [
          { id: "PRR_CR_ONLY", author: { __typename: "User", login: "bob" }, body: "unaddressed" },
        ],
      },
    });
    expect(data.changesRequestedReviews).toHaveLength(1);
    expect(data.changesRequestedReviews[0].id).toBe("PRR_CR_ONLY");
  });
});
