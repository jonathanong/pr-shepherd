import { describe, expect, it } from "vitest";
import { isCurrentSummaryReady } from "./poll-summary-readiness.mts";
import { summarizePollSummaryChecks } from "./poll-summary-checks.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

describe("GitHub conversation-resolution readiness", () => {
  function snapshot(overrides: Partial<RawSummaryPr> = {}): RawSummaryPr {
    return {
      number: 42,
      title: "Ready PR",
      url: "https://github.com/acme/widgets/pull/42",
      state: "OPEN",
      isDraft: false,
      viewerCanUpdate: true,
      headRefName: "feature",
      headRefOid: "a".repeat(40),
      baseRefName: "main",
      baseRefOid: "b".repeat(40),
      reviewDecision: "APPROVED",
      mergeQueueEntry: null,
      stack: null,
      stackEntry: null,
      comments: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
      reviews: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
      commits: { nodes: [] },
      isInMergeQueue: false,
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
      baseRef: {
        branchProtectionRule: null,
        rules: {
          nodes: [{ type: "PULL_REQUEST", parameters: { requiredReviewThreadResolution: true } }],
        },
      },
      reviewThreads: {
        totalCount: 76,
        pageInfo: { hasPreviousPage: true },
        nodes: [],
      },
      ...overrides,
    };
  }

  it("certifies a clean protected PR despite an incomplete compact review sample", () => {
    const pr = snapshot();
    expect(isCurrentSummaryReady(pr, summarizePollSummaryChecks(pr), { incomplete: true })).toBe(
      true,
    );
  });

  it("accepts the classic branch-protection conversation-resolution requirement", () => {
    const pr = snapshot({
      baseRef: {
        branchProtectionRule: {
          requiresApprovingReviews: false,
          requiredApprovingReviewCount: 0,
          requiresConversationResolution: true,
          requiresStatusChecks: false,
          requiredStatusCheckContexts: [],
        },
        rules: null,
      },
    });
    expect(isCurrentSummaryReady(pr, summarizePollSummaryChecks(pr), { incomplete: true })).toBe(
      true,
    );
  });

  it.each(["BLOCKED", "UNKNOWN", "UNSTABLE", "HAS_HOOKS"])(
    "does not certify incomplete review evidence when GitHub reports %s",
    (mergeStateStatus) => {
      const pr = snapshot({ mergeStateStatus });
      expect(isCurrentSummaryReady(pr, {}, { incomplete: true })).toBe(false);
    },
  );

  it("does not require complete review samples without required conversation resolution", () => {
    expect(isCurrentSummaryReady(snapshot({ baseRef: null }), {}, { incomplete: true })).toBe(true);
  });

  it.each([{ actionable: 1, incomplete: true as const }, { actionable: 1 }])(
    "does not hide actionable sampled feedback: %o",
    (review) => {
      const pr = snapshot();
      expect(isCurrentSummaryReady(pr, {}, review)).toBe(false);
    },
  );

  it("does not bypass incomplete CI evidence", () => {
    expect(isCurrentSummaryReady(snapshot(), { incomplete: true }, { incomplete: true })).toBe(
      false,
    );
  });

  it("does not assume resolution is optional when applicable rules are truncated", () => {
    const pr = snapshot({
      isInMergeQueue: true,
      mergeStateStatus: "BLOCKED",
      baseRef: {
        branchProtectionRule: null,
        rules: { pageInfo: { hasNextPage: true }, nodes: [] },
      },
    });
    expect(isCurrentSummaryReady(pr, {}, { incomplete: true }, { allowQueuedProgress: true })).toBe(
      false,
    );
  });

  it("does not treat a queued BLOCKED state as proof that conversations are resolved", () => {
    const pr = snapshot({ isInMergeQueue: true, mergeStateStatus: "BLOCKED" });
    expect(isCurrentSummaryReady(pr, {}, { incomplete: true }, { allowQueuedProgress: true })).toBe(
      false,
    );
  });
});
