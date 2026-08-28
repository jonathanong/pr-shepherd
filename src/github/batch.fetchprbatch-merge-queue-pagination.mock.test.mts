import { describe, expect, it } from "vitest";
import {
  makeRawPr,
  makeResponse,
  mockGraphql,
  mockGraphqlWithRateLimit,
  registerHooks,
  REPO,
} from "../../test-helpers/github/batch.test-support.mts";
import { fetchPrBatch } from "./batch.mts";

registerHooks();

const check = (name: string, conclusion: string) => ({
  __typename: "CheckRun",
  id: `CR_${name}`,
  name,
  status: "COMPLETED",
  conclusion,
  detailsUrl: null,
  checkSuite: { workflowRun: { event: "merge_group", workflow: null } },
});

describe("fetchPrBatch — merge queue check pagination", () => {
  it("fetches failures after the first 100 queue contexts before classifying them", async () => {
    const pr = makeRawPr({
      isInMergeQueue: true,
      mergeQueueEntry: {
        position: 1,
        state: "AWAITING_CHECKS",
        estimatedTimeToMerge: null,
        headCommit: {
          oid: "queue123",
          statusCheckRollup: {
            contexts: {
              pageInfo: { hasNextPage: true, endCursor: "queue-cursor-1" },
              nodes: [check("first", "SUCCESS")],
            },
          },
        },
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));
    mockGraphql.mockResolvedValue({
      data: {
        repository: {
          object: {
            __typename: "Commit",
            oid: "queue123",
            statusCheckRollup: {
              contexts: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [check("failure-after-100", "FAILURE")],
              },
            },
          },
        },
      },
    });

    const { data } = await fetchPrBatch(42, REPO);
    expect(data.mergeQueueChecks?.map((item) => item.name)).toEqual(["first", "failure-after-100"]);
    expect(data.mergeQueueChecksIncomplete).toBeUndefined();
    expect(mockGraphql).toHaveBeenCalledWith(expect.any(String), {
      owner: "owner",
      repo: "repo",
      oid: "queue123",
      cursor: "queue-cursor-1",
    });
  });
});
