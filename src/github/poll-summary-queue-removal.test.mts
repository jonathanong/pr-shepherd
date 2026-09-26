import { describe, expect, it } from "vitest";
import { currentQueueRemovalEvent } from "./poll-summary-queue-removal.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

const removal = {
  id: "removal-1",
  reason: "CI_FAILURE",
  createdAt: "2026-09-20T10:10:00Z",
  actor: null,
  beforeCommit: { oid: "queue-head", parents: { nodes: [{ oid: "pr-head" }] } },
};

function raw(overrides: Partial<RawSummaryPr> = {}): RawSummaryPr {
  return {
    headRefOid: "pr-head",
    isInMergeQueue: false,
    mergeQueueAdditions: { nodes: [{ createdAt: "2026-09-20T10:00:00Z" }] },
    mergeQueueRemovals: { nodes: [removal] },
    ...overrides,
  } as RawSummaryPr;
}

describe("currentQueueRemovalEvent", () => {
  it("returns a removal tied to the current PR head", () => {
    expect(currentQueueRemovalEvent(raw())).toEqual(removal);
  });

  it("returns a single-parent squash removal when the head is unchanged", () => {
    const squash = {
      ...removal,
      beforeCommit: { oid: "queue-head", parents: { nodes: [{ oid: "base-sha" }] } },
    };
    expect(
      currentQueueRemovalEvent(
        raw({
          headRefOid: "pr-head",
          commits: {
            nodes: [
              {
                commit: {
                  oid: "pr-head",
                  committedDate: "2026-09-20T10:00:00Z",
                  statusCheckRollup: null,
                },
              },
            ],
          },
          mergeQueueRemovals: { nodes: [squash] },
        }),
      ),
    ).toEqual(squash);
  });

  it("rejects a single-parent removal pushed after it with an earlier committer time", () => {
    expect(
      currentQueueRemovalEvent(
        raw({
          headRefOid: "bbbb",
          commits: {
            nodes: [
              {
                commit: {
                  oid: "bbbb",
                  committedDate: "2026-09-20T10:05:00Z",
                  statusCheckRollup: {
                    contexts: {
                      totalCount: 1,
                      pageInfo: { hasPreviousPage: false },
                      nodes: [
                        {
                          __typename: "CheckRun",
                          name: "CI",
                          status: "IN_PROGRESS",
                          conclusion: null,
                          checkSuite: {
                            createdAt: "2026-09-20T10:11:00Z",
                            workflowRun: {
                              event: "pull_request",
                              createdAt: "2026-09-20T10:12:00Z",
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              },
            ],
          },
          mergeQueueRemovals: {
            nodes: [
              {
                ...removal,
                beforeCommit: { oid: "queue-head", parents: { nodes: [{ oid: "base-sha" }] } },
              },
            ],
          },
        }),
      ),
    ).toBeNull();
  });

  it("rejects a single-parent removal after the head is committed later", () => {
    expect(
      currentQueueRemovalEvent(
        raw({
          headRefOid: "new-head",
          commits: {
            nodes: [
              {
                commit: {
                  oid: "new-head",
                  committedDate: "2026-09-20T11:00:00Z",
                  statusCheckRollup: null,
                },
              },
            ],
          },
          mergeQueueRemovals: {
            nodes: [
              {
                ...removal,
                beforeCommit: { oid: "queue-head", parents: { nodes: [{ oid: "base-sha" }] } },
              },
            ],
          },
        }),
      ),
    ).toBeNull();
  });

  it.each([
    ["no removal", { mergeQueueRemovals: { nodes: [] } }],
    ["already requeued", { isInMergeQueue: true }],
    ["invalid time", { mergeQueueRemovals: { nodes: [{ ...removal, createdAt: "invalid" }] } }],
    ["newer addition", { mergeQueueAdditions: { nodes: [{ createdAt: "2026-09-20T10:20:00Z" }] } }],
    [
      "merge-commit head moved",
      {
        headRefOid: "other-head",
        mergeQueueRemovals: {
          nodes: [
            {
              ...removal,
              beforeCommit: {
                oid: "queue-head",
                parents: { nodes: [{ oid: "base-sha" }, { oid: "pr-head" }] },
              },
            },
          ],
        },
      },
    ],
    ["unknown parents", { mergeQueueRemovals: { nodes: [{ ...removal, beforeCommit: null }] } }],
  ])("rejects %s", (_case, changes) => {
    expect(currentQueueRemovalEvent(raw(changes as Partial<RawSummaryPr>))).toBeNull();
  });
});
