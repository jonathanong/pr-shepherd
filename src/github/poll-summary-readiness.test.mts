import { describe, expect, it } from "vitest";
import { isCurrentSummaryReady } from "./poll-summary-readiness.mts";
import { summarizePollSummaryChecks } from "./poll-summary-checks.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

const empty = { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] };

function rollup(state: string) {
  return {
    contexts: {
      totalCount: 1,
      pageInfo: { hasPreviousPage: false },
      nodes: [{ __typename: "StatusContext" as const, context: "build", state }],
    },
  };
}

function raw(sourceState: string | null, queueState: string | null): RawSummaryPr {
  return {
    number: 42,
    title: "PR",
    url: "https://github.com/acme/widgets/pull/42",
    state: "OPEN",
    isDraft: false,
    viewerCanUpdate: true,
    headRefName: "feature",
    headRefOid: "a".repeat(40),
    baseRefName: "main",
    baseRefOid: "b".repeat(40),
    mergeable: "UNKNOWN",
    mergeStateStatus: "BLOCKED",
    reviewDecision: "APPROVED",
    isInMergeQueue: true,
    mergeQueueEntry: { headCommit: { statusCheckRollup: queueState ? rollup(queueState) : null } },
    stack: null,
    stackEntry: null,
    comments: empty,
    reviews: empty,
    reviewThreads: empty,
    commits: {
      nodes: [{ commit: { statusCheckRollup: sourceState ? rollup(sourceState) : null } }],
    },
  };
}

describe("queued readiness", () => {
  it("allows a running merge-group check after source CI completed", () => {
    const snapshot = raw("SUCCESS", "PENDING");
    expect(
      isCurrentSummaryReady(
        snapshot,
        summarizePollSummaryChecks(snapshot),
        {},
        {
          allowQueuedProgress: true,
        },
      ),
    ).toBe(true);
  });

  it("does not excuse a newly pending source-commit check", () => {
    const snapshot = raw("PENDING", "PENDING");
    expect(
      isCurrentSummaryReady(
        snapshot,
        summarizePollSummaryChecks(snapshot),
        {},
        {
          allowQueuedProgress: true,
        },
      ),
    ).toBe(false);
  });

  it("does not excuse a failed merge-group check", () => {
    const snapshot = raw("SUCCESS", "FAILURE");
    expect(
      isCurrentSummaryReady(
        snapshot,
        summarizePollSummaryChecks(snapshot),
        {},
        {
          allowQueuedProgress: true,
        },
      ),
    ).toBe(false);
  });
});
