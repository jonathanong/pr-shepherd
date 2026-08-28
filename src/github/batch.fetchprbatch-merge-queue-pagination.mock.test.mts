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

function queuedPr(pageInfo: { hasNextPage: boolean; endCursor: string | null }) {
  return makeRawPr({
    isInMergeQueue: true,
    mergeQueueEntry: {
      position: 1,
      state: "AWAITING_CHECKS",
      estimatedTimeToMerge: null,
      headCommit: {
        oid: "queue123",
        statusCheckRollup: {
          contexts: { pageInfo, nodes: [check("first", "SUCCESS")] },
        },
      },
    },
  });
}

describe("fetchPrBatch — merge queue check pagination", () => {
  it("fetches failures after the first 100 queue contexts before classifying them", async () => {
    const pr = queuedPr({ hasNextPage: true, endCursor: "queue-cursor-1" });
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

  it("rejects a missing initial next-page cursor", async () => {
    mockGraphqlWithRateLimit.mockResolvedValue(
      makeResponse(queuedPr({ hasNextPage: true, endCursor: null })),
    );
    await expect(fetchPrBatch(42, REPO)).rejects.toThrow("omitted the next cursor");
  });

  it("rejects a changed commit during queue pagination", async () => {
    mockGraphqlWithRateLimit.mockResolvedValue(
      makeResponse(queuedPr({ hasNextPage: true, endCursor: "cursor" })),
    );
    mockGraphql.mockResolvedValue({
      data: { repository: { object: { __typename: "Commit", oid: "other" } } },
    });
    await expect(fetchPrBatch(42, REPO)).rejects.toThrow("disappeared or changed");
  });

  it("rejects a disappearing rollup during queue pagination", async () => {
    mockGraphqlWithRateLimit.mockResolvedValue(
      makeResponse(queuedPr({ hasNextPage: true, endCursor: "cursor" })),
    );
    mockGraphql.mockResolvedValue({
      data: {
        repository: {
          object: { __typename: "Commit", oid: "queue123", statusCheckRollup: null },
        },
      },
    });
    await expect(fetchPrBatch(42, REPO)).rejects.toThrow("statusCheckRollup disappeared");
  });

  it("rejects a missing cursor on a later queue page", async () => {
    mockGraphqlWithRateLimit.mockResolvedValue(
      makeResponse(queuedPr({ hasNextPage: true, endCursor: "cursor" })),
    );
    mockGraphql.mockResolvedValue({
      data: {
        repository: {
          object: {
            __typename: "Commit",
            oid: "queue123",
            statusCheckRollup: {
              contexts: {
                pageInfo: { hasNextPage: true, endCursor: null },
                nodes: [check("second", "SUCCESS")],
              },
            },
          },
        },
      },
    });
    await expect(fetchPrBatch(42, REPO)).rejects.toThrow("omitted the next cursor");
  });

  it("does not paginate a removal older than the latest enqueue", async () => {
    const pr = makeRawPr({
      mergeQueueAdditions: { nodes: [{ createdAt: "2026-08-27T13:00:00Z" }] },
      mergeQueueRemovals: {
        nodes: [
          {
            reason: "CI_FAILURE",
            createdAt: "2026-08-27T12:00:00Z",
            beforeCommit: {
              oid: "old-queue",
              statusCheckRollup: {
                contexts: {
                  pageInfo: { hasNextPage: true, endCursor: "stale-cursor" },
                  nodes: [check("old", "FAILURE")],
                },
              },
            },
          },
        ],
      },
    });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.latestMergeQueueRemoval).toBeNull();
    expect(mockGraphql).not.toHaveBeenCalled();
  });
});
