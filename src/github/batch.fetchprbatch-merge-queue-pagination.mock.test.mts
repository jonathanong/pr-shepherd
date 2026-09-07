/* eslint-disable max-lines */
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
  it("loads queue check contexts when the batch omits the rollup", async () => {
    mockGraphqlWithRateLimit.mockResolvedValue(
      makeResponse(
        makeRawPr({
          isInMergeQueue: true,
          mergeQueueEntry: {
            position: 1,
            state: "AWAITING_CHECKS",
            estimatedTimeToMerge: null,
            headCommit: { oid: "queue123" },
          },
        }),
      ),
    );
    mockGraphql.mockResolvedValue({
      data: {
        repository: {
          object: {
            __typename: "Commit",
            oid: "queue123",
            statusCheckRollup: {
              contexts: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [check("queue-ci", "FAILURE")],
              },
            },
          },
        },
      },
    });

    const { data } = await fetchPrBatch(42, REPO);
    expect(data.mergeQueueChecks?.map((item) => item.name)).toEqual(["queue-ci"]);
    expect(mockGraphql).toHaveBeenCalledWith(expect.any(String), {
      owner: "owner",
      repo: "repo",
      oid: "queue123",
    });
  });

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

  it("follows a later queue page when the follow-up still has a next cursor", async () => {
    const pr = queuedPr({ hasNextPage: true, endCursor: "queue-cursor-1" });
    mockGraphqlWithRateLimit.mockResolvedValue(makeResponse(pr));
    mockGraphql
      .mockResolvedValueOnce({
        data: {
          repository: {
            object: {
              __typename: "Commit",
              oid: "queue123",
              statusCheckRollup: {
                contexts: {
                  pageInfo: { hasNextPage: true, endCursor: "queue-cursor-2" },
                  nodes: [check("second", "SUCCESS")],
                },
              },
            },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          repository: {
            object: {
              __typename: "Commit",
              oid: "queue123",
              statusCheckRollup: {
                contexts: {
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: [check("third", "SUCCESS")],
                },
              },
            },
          },
        },
      });

    const { data } = await fetchPrBatch(42, REPO);
    expect(data.mergeQueueChecks?.map((item) => item.name)).toEqual(["first", "second", "third"]);
    expect(mockGraphql).toHaveBeenNthCalledWith(2, expect.any(String), {
      owner: "owner",
      repo: "repo",
      oid: "queue123",
      cursor: "queue-cursor-2",
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

  it("treats a null rollup on the initial queue follow-up as empty", async () => {
    mockGraphqlWithRateLimit.mockResolvedValue(
      makeResponse(
        makeRawPr({
          isInMergeQueue: true,
          mergeQueueEntry: {
            position: 1,
            state: "AWAITING_CHECKS",
            estimatedTimeToMerge: null,
            headCommit: { oid: "queue123" },
          },
        }),
      ),
    );
    mockGraphql.mockResolvedValue({
      data: {
        repository: {
          object: { __typename: "Commit", oid: "queue123", statusCheckRollup: null },
        },
      },
    });
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.mergeQueueChecks).toBeUndefined();
  });

  it("skips queue-check hydration when mergeQueueEntry has no head commit", async () => {
    mockGraphqlWithRateLimit.mockResolvedValue(
      makeResponse(
        makeRawPr({
          isInMergeQueue: true,
          mergeQueueEntry: {
            position: 1,
            state: "QUEUED",
            estimatedTimeToMerge: null,
          },
        }),
      ),
    );
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.mergeQueueChecks).toBeUndefined();
    expect(mockGraphql).not.toHaveBeenCalled();
  });

  it("hydrates a current removal commit when it differs from the active queue head", async () => {
    mockGraphqlWithRateLimit.mockResolvedValue(
      makeResponse(
        makeRawPr({
          isInMergeQueue: true,
          mergeQueueAdditions: { nodes: [{ createdAt: "2026-08-27T12:00:00Z" }] },
          mergeQueueRemovals: {
            nodes: [
              {
                reason: "CI_FAILURE",
                createdAt: "2026-08-27T13:00:00Z",
                beforeCommit: {
                  oid: "removed-queue",
                  parents: { nodes: [{ oid: "abc123" }] },
                },
              },
            ],
          },
          mergeQueueEntry: {
            position: 1,
            state: "AWAITING_CHECKS",
            estimatedTimeToMerge: null,
            headCommit: { oid: "queue123" },
          },
        }),
      ),
    );
    mockGraphql.mockImplementation(async (_doc, vars: Record<string, unknown> = {}) => ({
      data: {
        repository: {
          object: {
            __typename: "Commit",
            oid: vars["oid"],
            statusCheckRollup: {
              contexts: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [
                  check(vars["oid"] === "removed-queue" ? "removed-ci" : "queue-ci", "FAILURE"),
                ],
              },
            },
          },
        },
      },
    }));

    const { data } = await fetchPrBatch(42, REPO);
    expect(data.mergeQueueChecks?.map((item) => item.name)).toEqual(["queue-ci"]);
    expect(data.removedMergeQueueChecks?.map((item) => item.name)).toEqual(["removed-ci"]);
    expect(mockGraphql).toHaveBeenCalledTimes(2);
  });

  it("does not hydrate a removal whose parents no longer contain HEAD", async () => {
    mockGraphqlWithRateLimit.mockResolvedValue(
      makeResponse(
        makeRawPr({
          mergeQueueRemovals: {
            nodes: [
              {
                reason: "MANUALLY_DEQUEUED",
                createdAt: "2026-08-27T13:00:00Z",
                beforeCommit: {
                  oid: "removed-queue",
                  parents: { nodes: [{ oid: "old-head" }] },
                },
              },
            ],
          },
        }),
      ),
    );
    const { data } = await fetchPrBatch(42, REPO);
    expect(data.removedMergeQueueChecks).toBeUndefined();
    expect(mockGraphql).not.toHaveBeenCalled();
  });
});
