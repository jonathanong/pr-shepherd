import { describe, it, expect } from "vitest";
import { deriveMergeRequirements } from "./requirements.mts";
import {
  formatMergeRequirementLines,
  blockedReasonFromRequirements,
} from "./requirements-format.mts";
import { EMPTY_BRANCH_RULES } from "../github/batch-parsers-rules.mts";
import type { BatchPrData, BranchRules } from "../types.mts";

function makePr(overrides: Partial<BatchPrData> = {}): BatchPrData {
  return {
    nodeId: "PR_kgDOAAA",
    number: 42,
    state: "OPEN",
    isDraft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: null,
    headRefOid: "abc",
    headRefName: "feature",
    headRepoWithOwner: "owner/repo",
    baseRefName: "main",
    reviewRequests: [],
    latestReviews: [],
    reviewThreads: [],
    comments: [],
    changesRequestedReviews: [],
    reviewSummaries: [],
    approvedReviews: [],
    checks: [],
    branchProtection: null,
    branchRules: { ...EMPTY_BRANCH_RULES },
    isInMergeQueue: false,
    isMergeQueueEnabled: false,
    mergeQueueEntry: null,
    stack: null,
    ...overrides,
  };
}

describe("deriveMergeRequirements", () => {
  it("reports no required approvals or conversations by default", () => {
    const req = deriveMergeRequirements(makePr());
    expect(req.approvals).toEqual({ current: 0, requiredCount: 0 });
    expect(req.conversationsResolved).toEqual({
      resolved: true,
      unresolvedCount: 0,
      required: false,
    });
    expect(req.mergeQueue).toBeUndefined();
    expect(req.stack).toBeUndefined();
  });

  it("counts latest APPROVED reviews against required count", () => {
    const req = deriveMergeRequirements(
      makePr({
        latestReviews: [
          { login: "a", state: "APPROVED" },
          { login: "b", state: "COMMENTED" },
        ],
        branchRules: { ...EMPTY_BRANCH_RULES, requiredApprovingReviewCount: 2 },
      }),
    );
    expect(req.approvals).toEqual({ current: 1, requiredCount: 2 });
  });

  it("surfaces merge queue and stack when present", () => {
    const req = deriveMergeRequirements(
      makePr({
        isInMergeQueue: true,
        isMergeQueueEnabled: true,
        mergeQueueEntry: { position: 2, state: "QUEUED", estimatedTimeToMerge: 60 },
        stack: { number: 3, size: 4, position: 2, baseRefName: "main" },
        branchRules: { ...EMPTY_BRANCH_RULES, requiresMergeQueue: true },
      }),
    );
    expect(req.mergeQueue).toEqual({
      required: true,
      enabled: true,
      inQueue: true,
      position: 2,
      state: "QUEUED",
    });
    expect(req.stack?.number).toBe(3);
  });
});

describe("formatMergeRequirementLines", () => {
  it("always emits approvals and conversations", () => {
    const lines = formatMergeRequirementLines(deriveMergeRequirements(makePr()));
    expect(lines[0]).toBe("Approvals: None [Not Required]");
    expect(lines[1]).toBe("Conversations Resolved: Yes [Not Required]");
  });

  it("formats required approvals and unresolved conversations", () => {
    const rules: BranchRules = {
      ...EMPTY_BRANCH_RULES,
      requiredApprovingReviewCount: 2,
      requiresConversationResolution: true,
    };
    const lines = formatMergeRequirementLines(
      deriveMergeRequirements(
        makePr({
          branchRules: rules,
          reviewThreads: [
            {
              id: "t1",
              isResolved: false,
              isOutdated: false,
              isMinimized: false,
              path: "a.ts",
              line: 1,
              startLine: null,
              author: "r",
              authorType: "User",
              body: "fix",
              url: "",
              createdAtUnix: 0,
            },
          ],
        }),
      ),
    );
    expect(lines[0]).toBe("Approvals: None [Required]");
    expect(lines[1]).toBe("Conversations Resolved: No [Required]");
  });

  it("formats merge queue and stack lines", () => {
    const req = deriveMergeRequirements(
      makePr({
        isInMergeQueue: true,
        isMergeQueueEnabled: true,
        mergeQueueEntry: { position: 1, state: "QUEUED", estimatedTimeToMerge: null },
        stack: { number: 9, size: 2, position: 1, baseRefName: "main" },
        branchRules: { ...EMPTY_BRANCH_RULES, requiresMergeQueue: true },
      }),
    );
    const lines = formatMergeRequirementLines(req);
    expect(lines).toContain("Merge queue: position 1 QUEUED [Required]");
    expect(lines).toContain("Stack: 9 (layer 1/2, base main)");
    expect(lines.find((line) => line.startsWith("Stack:"))).not.toMatch(/#9\b/);
  });

  it("formats merge queue as No when required but not in queue", () => {
    const lines = formatMergeRequirementLines(
      deriveMergeRequirements(
        makePr({
          isMergeQueueEnabled: true,
          branchRules: { ...EMPTY_BRANCH_RULES, requiresMergeQueue: true },
        }),
      ),
    );
    expect(lines).toContain("Merge queue: No [Required]");
    expect(lines.some((line) => line.startsWith("Stack:"))).toBe(false);
  });
});

describe("blockedReasonFromRequirements", () => {
  it("returns null when requirements are absent", () => {
    expect(blockedReasonFromRequirements(undefined)).toBeNull();
  });

  it("describes unmet approvals", () => {
    const req = deriveMergeRequirements(
      makePr({ branchRules: { ...EMPTY_BRANCH_RULES, requiredApprovingReviewCount: 1 } }),
    );
    expect(blockedReasonFromRequirements(req)).toContain("awaiting 1 approval");
  });

  it("does not treat presence of required checks as an unmet blocker", () => {
    const req = deriveMergeRequirements(
      makePr({
        branchRules: {
          ...EMPTY_BRANCH_RULES,
          requiredStatusCheckContexts: ["ci"],
          requiresCommitSignatures: true,
          requiresCodeOwnerReviews: true,
        },
      }),
    );
    expect(blockedReasonFromRequirements(req)).toBeNull();
  });

  it("describes merge-queue membership without treating a stack as a blocker", () => {
    const req = deriveMergeRequirements(
      makePr({
        isInMergeQueue: true,
        isMergeQueueEnabled: true,
        mergeQueueEntry: { position: 3, state: "AWAITING_CHECKS", estimatedTimeToMerge: null },
        stack: { number: 7, size: 2, position: 1, baseRefName: "main" },
        branchRules: { ...EMPTY_BRANCH_RULES, requiresMergeQueue: true },
      }),
    );
    const reason = blockedReasonFromRequirements(req);
    expect(reason).toContain("in merge queue position 3");
    expect(reason).not.toContain("stack");
  });
});
