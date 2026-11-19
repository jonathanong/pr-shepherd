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

const noPage = { pageInfo: { hasPreviousPage: false, startCursor: null } };

async function commitsSince(reviewed: string, oids?: string[]) {
  mockGraphqlWithRateLimit.mockResolvedValue(
    makeResponse(
      makeRawPr({
        headRefOid: "c3",
        ...(oids && { prCommitOids: { nodes: oids.map((oid) => ({ commit: { oid } })) } }),
        changesRequestedReviews: {
          ...noPage,
          nodes: [
            {
              id: "PRR_1",
              author: { __typename: "User", login: "alice" },
              body: "fix",
              commit: { oid: reviewed },
            },
          ],
        },
      }),
    ),
  );
  const { data } = await fetchPrBatch(42, REPO);
  return data.changesRequestedReviews[0]!.commitsSince;
}

describe("fetchPrBatch — commitsSince", () => {
  it("counts commits after the reviewed one", async () => {
    expect(await commitsSince("c1", ["c1", "c2", "c3"])).toBe(2);
  });

  it("is 0 for a review on the head", async () => {
    expect(await commitsSince("c3", ["c1", "c2", "c3"])).toBe(0);
  });

  it("is omitted when the reviewed commit is not among the PR's commits", async () => {
    expect(await commitsSince("gone", ["c1", "c2", "c3"])).toBeUndefined();
  });

  it("is omitted when the transport has no commit list", async () => {
    expect(await commitsSince("c1")).toBeUndefined();
  });
});
