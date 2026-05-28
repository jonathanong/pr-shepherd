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

const noPage = { pageInfo: { hasPreviousPage: false, startCursor: null } };

describe("fetchPrBatch — changesRequestedReviews dedup via latestReviews", () => {
  it.each([
    ["APPROVED", "coderabbitai[bot]", "Bot"],
    ["DISMISSED", "alice", "User"],
  ] as const)("drops CR when same author's latest review is %s", async (state, login, typename) => {
    const data = await fetchWithConfig({
      latestReviews: { nodes: [{ author: { __typename: typename, login }, state }] },
      changesRequestedReviews: {
        ...noPage,
        nodes: [{ id: "PRR_CR", author: { __typename: typename, login }, body: "stale" }],
      },
    });
    expect(data.changesRequestedReviews).toHaveLength(0);
  });

  it.each([
    ["CHANGES_REQUESTED", "bob", "User", "PRR_CR_3"],
    ["PENDING", "copilot[bot]", "Bot", "PRR_CR_PEND"],
    ["COMMENTED", "alice", "User", "PRR_CR_CMT"],
  ] as const)(
    "keeps CR when same author's latest review is %s",
    async (state, login, typename, id) => {
      const data = await fetchWithConfig({
        latestReviews: { nodes: [{ author: { __typename: typename, login }, state }] },
        changesRequestedReviews: {
          ...noPage,
          nodes: [{ id, author: { __typename: typename, login }, body: "unresolved" }],
        },
      });
      expect(data.changesRequestedReviews).toHaveLength(1);
      expect(data.changesRequestedReviews[0].id).toBe(id);
    },
  );

  it("keeps CR when the author does not appear in latestReviews", async () => {
    const data = await fetchWithConfig({
      latestReviews: { nodes: [] },
      changesRequestedReviews: {
        ...noPage,
        nodes: [{ id: "PRR_CR_ONLY", author: { __typename: "User", login: "bob" }, body: "x" }],
      },
    });
    expect(data.changesRequestedReviews).toHaveLength(1);
    expect(data.changesRequestedReviews[0].id).toBe("PRR_CR_ONLY");
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
        ...noPage,
        nodes: [
          { id: "PRR_CR_A", author: { __typename: "User", login: "alice" }, body: "old" },
          { id: "PRR_CR_B", author: { __typename: "User", login: "bob" }, body: "active" },
        ],
      },
    });
    expect(data.changesRequestedReviews).toHaveLength(1);
    expect(data.changesRequestedReviews[0].id).toBe("PRR_CR_B");
  });

  it("keeps CR reviews from null-author accounts even if another null-author later approved", async () => {
    const data = await fetchWithConfig({
      latestReviews: { nodes: [{ author: null, state: "APPROVED" }] },
      changesRequestedReviews: {
        ...noPage,
        nodes: [{ id: "PRR_CR_NULL", author: null, body: "needs work" }],
      },
    });
    expect(data.changesRequestedReviews).toHaveLength(1);
    expect(data.changesRequestedReviews[0].id).toBe("PRR_CR_NULL");
  });
});
