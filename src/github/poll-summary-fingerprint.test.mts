import { describe, expect, it } from "vitest";
import { fingerprintRawSummaryPr } from "./poll-summary-fingerprint.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

const empty = { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] };

function raw(overrides: Partial<RawSummaryPr> = {}): RawSummaryPr {
  return {
    number: 42,
    title: "Ready PR",
    url: "https://github.com/acme/widgets/pull/42",
    state: "OPEN",
    updatedAt: "2026-09-20T10:00:00Z",
    isDraft: false,
    viewerCanUpdate: true,
    headRefName: "feature",
    headRefOid: "a".repeat(40),
    baseRefName: "main",
    baseRefOid: "b".repeat(40),
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "APPROVED",
    isInMergeQueue: false,
    mergeQueueEntry: null,
    stack: null,
    stackEntry: null,
    comments: empty,
    reviews: empty,
    reviewThreads: empty,
    commits: { nodes: [] },
    ...overrides,
  };
}

describe("fingerprintRawSummaryPr", () => {
  it("requires freshness and commit identity to persist a receipt", () => {
    expect(fingerprintRawSummaryPr(raw({ updatedAt: undefined }))).toBeNull();
    expect(fingerprintRawSummaryPr(raw({ headRefOid: "" }))).toBeNull();
    expect(fingerprintRawSummaryPr(raw({ baseRefOid: "" }))).toBeNull();
  });

  it("survives queue entry, queue checks, and computed merge-state changes", () => {
    const before = raw();
    const queued = raw({
      updatedAt: "2026-09-20T10:10:00Z",
      isInMergeQueue: true,
      mergeable: "UNKNOWN",
      mergeStateStatus: "BLOCKED",
      mergeQueueAdditions: { nodes: [{ createdAt: "2026-09-20T10:10:00Z" }] },
      mergeQueueEntry: {
        headCommit: {
          oid: "f".repeat(40),
          statusCheckRollup: {
            contexts: {
              totalCount: 1,
              pageInfo: { hasPreviousPage: false },
              nodes: [{ __typename: "StatusContext", context: "merge-group", state: "PENDING" }],
            },
          },
        },
      },
    });
    expect(fingerprintRawSummaryPr(queued)).toBe(fingerprintRawSummaryPr(before));
  });

  it.each([
    ["new head", { headRefOid: "c".repeat(40) }],
    ["moved base", { baseRefOid: "d".repeat(40) }],
    ["retargeted base at same commit", { baseRefName: "release" }],
    ["draft", { isDraft: true }],
    ["review withdrawn", { reviewDecision: "REVIEW_REQUIRED" }],
    ["new comment", { comments: { ...empty, totalCount: 1 } }],
    ["new review", { reviews: { ...empty, totalCount: 1 } }],
    ["new thread", { reviewThreads: { ...empty, totalCount: 1 } }],
    [
      "changed CI",
      { commits: { nodes: [{ commit: { oid: "e".repeat(40), statusCheckRollup: null } }] } },
    ],
    [
      "close and reopen",
      {
        lifecycleEvents: {
          nodes: [{ __typename: "ReopenedEvent", createdAt: "2026-09-20T11:00:00Z" }],
        },
      },
    ],
    [
      "draft and ready again",
      {
        lifecycleEvents: {
          nodes: [{ __typename: "ReadyForReviewEvent", createdAt: "2026-09-20T11:00:00Z" }],
        },
      },
    ],
  ])("invalidates on %s", (_name, change) => {
    expect(fingerprintRawSummaryPr(raw(change as Partial<RawSummaryPr>))).not.toBe(
      fingerprintRawSummaryPr(raw()),
    );
  });

  it("invalidates when a completed check gains an annotation", () => {
    const withAnnotationCount = (totalCount: number): RawSummaryPr =>
      raw({
        commits: {
          nodes: [
            {
              commit: {
                oid: "e".repeat(40),
                statusCheckRollup: {
                  contexts: {
                    totalCount: 1,
                    pageInfo: { hasPreviousPage: false },
                    nodes: [
                      {
                        __typename: "CheckRun",
                        id: "check-1",
                        name: "analysis",
                        status: "COMPLETED",
                        conclusion: "SKIPPED",
                        annotations: { totalCount },
                        checkSuite: null,
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      });

    expect(fingerprintRawSummaryPr(withAnnotationCount(1))).not.toBe(
      fingerprintRawSummaryPr(withAnnotationCount(0)),
    );
  });

  it("ignores body edits on hidden comments, reviews, and thread comments only", () => {
    const withBodies = (body: string, isMinimized: boolean): RawSummaryPr => {
      const node = { id: "node-1", body, isMinimized, author: { login: "summary-bot" } };
      const connection = { totalCount: 1, pageInfo: { hasPreviousPage: false }, nodes: [node] };
      return raw({
        comments: connection,
        reviews: { ...connection, nodes: [{ ...node, state: "COMMENTED" }] },
        reviewThreads: {
          ...connection,
          nodes: [
            {
              id: "thread-1",
              isResolved: true,
              isOutdated: false,
              path: "src/index.ts",
              rootComments: { nodes: [node] },
              comments: connection,
            },
          ],
        },
      });
    };

    expect(fingerprintRawSummaryPr(withBodies("edited", true))).toBe(
      fingerprintRawSummaryPr(withBodies("original", true)),
    );
    expect(fingerprintRawSummaryPr(withBodies("edited", false))).not.toBe(
      fingerprintRawSummaryPr(withBodies("original", false)),
    );
  });

  it("ignores head check-suite status when hashing a ready receipt", () => {
    const commit = {
      oid: "e".repeat(40),
      committedDate: "2026-09-20T10:00:00Z",
      statusCheckRollup: null,
    };
    const withSuites = raw({
      commits: {
        nodes: [
          {
            commit: {
              ...commit,
              checkSuites: {
                nodes: [{ status: "QUEUED", conclusion: null, workflowRun: null }],
              },
            },
          },
        ],
      },
    });
    expect(fingerprintRawSummaryPr(withSuites)).toBe(
      fingerprintRawSummaryPr(raw({ commits: { nodes: [{ commit }] } })),
    );
  });
});
