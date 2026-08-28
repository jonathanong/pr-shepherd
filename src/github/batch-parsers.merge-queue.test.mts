import { describe, expect, it } from "vitest";
import { makeRawPr } from "../../test-helpers/github/batch-fixtures.mts";
import { parseRawPr } from "./batch-parsers.mts";
import type { RawPr } from "./batch-raw-types.mts";

function checkNode(event = "merge_group") {
  return {
    __typename: "CheckRun" as const,
    id: "CR_queue",
    name: "queue-ci",
    status: "COMPLETED",
    conclusion: "FAILURE",
    detailsUrl: "https://github.com/owner/repo/actions/runs/123",
    title: "queue failed",
    summary: null,
    checkSuite: { workflowRun: { event, workflow: { name: "CI", databaseId: 7 } } },
  };
}

function parse(raw: ReturnType<typeof makeRawPr>) {
  return parseRawPr(raw as unknown as RawPr, [], [], [], [], [], []);
}

describe("parseRawPr — merge queue", () => {
  it("keeps active synthetic-commit checks and raw queue metadata", () => {
    const raw = makeRawPr({
      isInMergeQueue: true,
      isMergeQueueEnabled: true,
      mergeQueueEntry: {
        position: 3,
        state: "AWAITING_CHECKS",
        estimatedTimeToMerge: 90,
        enqueuedAt: "2026-08-27T12:00:00Z",
        enqueuer: { login: "octocat" },
        headCommit: {
          oid: "queue123",
          statusCheckRollup: {
            contexts: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [checkNode()],
            },
          },
        },
      },
    });

    const data = parse(raw);
    expect(data.mergeQueueEntry).toMatchObject({
      position: 3,
      state: "AWAITING_CHECKS",
      headCommitOid: "queue123",
      enqueuer: "octocat",
    });
    expect(data.mergeQueueChecks).toEqual([
      expect.objectContaining({
        event: "merge_group",
        scope: "merge_group",
        commitOid: "queue123",
      }),
    ]);
  });

  it("surfaces the latest removal and its beforeCommit checks", () => {
    const raw = makeRawPr({
      mergeQueueAdditions: { nodes: [{ createdAt: "2026-08-27T11:00:00Z" }] },
      mergeQueueRemovals: {
        nodes: [
          {
            reason: "CI_FAILURE",
            actor: { login: "github-merge-queue" },
            createdAt: "2026-08-27T12:00:00Z",
            beforeCommit: {
              oid: "removed123",
              statusCheckRollup: {
                contexts: {
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: [checkNode()],
                },
              },
            },
          },
        ],
      },
    });

    const data = parse(raw);
    expect(data.latestMergeQueueRemoval).toMatchObject({
      reason: "CI_FAILURE",
      actor: "github-merge-queue",
      beforeCommitOid: "removed123",
    });
    expect(data.removedMergeQueueChecks?.[0]).toMatchObject({ commitOid: "removed123" });
  });

  it("rejects a null context on an active queue commit", () => {
    const raw = makeRawPr({
      mergeQueueEntry: {
        position: 1,
        state: "AWAITING_CHECKS",
        estimatedTimeToMerge: null,
        headCommit: {
          oid: "queue123",
          statusCheckRollup: {
            contexts: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [null],
            },
          },
        },
      },
    });

    expect(() => parse(raw)).toThrow("null check context");
  });

  it("keeps the removed queue commit parents for head freshness", () => {
    const data = parse(
      makeRawPr({
        mergeQueueRemovals: {
          nodes: [
            {
              reason: "CI_FAILURE",
              createdAt: "2026-08-27T12:00:00Z",
              beforeCommit: {
                oid: "removed123",
                parents: { nodes: [{ oid: "base123" }, { oid: "pr-head123" }] },
                statusCheckRollup: null,
              },
            },
          ],
        },
      }),
    );

    expect(data.latestMergeQueueRemoval?.beforeCommitParentOids).toEqual(["base123", "pr-head123"]);
  });

  it("does not treat a removal older than the latest enqueue as current", () => {
    const data = parse(
      makeRawPr({
        mergeQueueAdditions: { nodes: [{ createdAt: "2026-08-27T13:00:00Z" }] },
        mergeQueueRemovals: {
          nodes: [{ reason: "MANUAL", createdAt: "2026-08-27T12:00:00Z" }],
        },
      }),
    );
    expect(data.latestMergeQueueRemoval).toBeNull();
  });
});
