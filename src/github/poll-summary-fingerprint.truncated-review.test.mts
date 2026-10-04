import { describe, expect, it } from "vitest";
import { fingerprintRawSummaryPr } from "./poll-summary-fingerprint.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

function snapshot(): RawSummaryPr {
  const empty = { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] };
  return {
    number: 42,
    title: "Ready PR",
    url: "https://github.com/acme/widgets/pull/42",
    state: "OPEN",
    updatedAt: "2026-09-20T10:00:00Z",
    isDraft: false,
    viewerCanUpdate: true,
    headRefName: "feature",
    headRefOid: "head",
    baseRefOid: "base",
    baseRefName: "main",
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: null,
    isInMergeQueue: false,
    mergeQueueEntry: null,
    stack: null,
    stackEntry: null,
    comments: { ...empty },
    reviews: { ...empty },
    reviewThreads: { ...empty },
    commits: { nodes: [] },
  };
}

describe("truncated review fingerprint", () => {
  it.each(["comments", "reviews", "reviewThreads"] as const)(
    "invalidates on a PR update with omitted %s even when sampled nodes do not change",
    (connection) => {
      const pr = snapshot();
      pr[connection].pageInfo = { hasPreviousPage: true };
      const before = fingerprintRawSummaryPr(pr);
      pr.updatedAt = "2026-09-20T10:01:00Z";
      expect(fingerprintRawSummaryPr(pr)).not.toBe(before);
    },
  );

  it("invalidates when a sampled thread omits older replies", () => {
    const pr = snapshot();
    pr.reviewThreads.nodes = [
      {
        id: "thread",
        isResolved: true,
        isOutdated: false,
        path: "file.mts",
        comments: { totalCount: 6, pageInfo: { hasPreviousPage: true }, nodes: [] },
      },
    ];
    const before = fingerprintRawSummaryPr(pr);
    pr.updatedAt = "2026-09-20T10:01:00Z";
    expect(fingerprintRawSummaryPr(pr)).not.toBe(before);
  });
});
