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
    ["draft", { isDraft: true }],
    ["review withdrawn", { reviewDecision: "REVIEW_REQUIRED" }],
    ["new comment", { comments: { ...empty, totalCount: 1 } }],
    ["new review", { reviews: { ...empty, totalCount: 1 } }],
    ["new thread", { reviewThreads: { ...empty, totalCount: 1 } }],
    ["changed CI", { commits: { nodes: [{ commit: { statusCheckRollup: null } }] } }],
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
});
