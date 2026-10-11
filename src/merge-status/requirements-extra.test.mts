import { describe, it, expect } from "vitest";
import { deriveMergeRequirements } from "./requirements.mts";
import {
  formatMergeRequirementLines,
  blockedReasonFromRequirements,
} from "./requirements-format.mts";
import { EMPTY_BRANCH_RULES } from "../github/batch-parsers-rules.mts";
import type { BatchPrData } from "../types.mts";

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

const unresolvedThread = {
  id: "t1",
  isResolved: false,
  isOutdated: false,
  isMinimized: false,
  path: "a.ts",
  line: 1,
  startLine: null,
  author: "r",
  authorType: "User" as const,
  body: "fix",
  url: "",
  createdAtUnix: 0,
};

describe("deriveMergeRequirements extra rules", () => {
  it("surfaces remaining required-only fields", () => {
    const req = deriveMergeRequirements(
      makePr({
        mergeStateStatus: "BEHIND",
        branchRules: {
          ...EMPTY_BRANCH_RULES,
          requiresLastPushApproval: true,
          requiresLinearHistory: true,
          requiresStrictStatusChecks: true,
          requiredDeploymentEnvironments: ["prod"],
          requiresWorkflows: true,
          requiresCodeScanning: true,
        },
      }),
    );
    expect(req.lastPushApproval).toEqual({ required: true });
    expect(req.linearHistory).toEqual({ required: true });
    expect(req.branchUpToDate).toEqual({ current: false, required: true });
    expect(req.requiredDeployments).toEqual({ environments: ["prod"] });
    expect(req.requiredWorkflows).toEqual({ required: true });
    expect(req.codeScanning).toEqual({ required: true });
  });

  it("uses empty branch rules when the PR omits them", () => {
    const { branchRules: _, ...rest } = makePr();
    const req = deriveMergeRequirements(rest);
    expect(req.approvals.requiredCount).toBe(0);
    expect(req.branchUpToDate).toBeUndefined();
  });

  it("treats merge-queue enabled as required even when not in queue", () => {
    const req = deriveMergeRequirements(makePr({ isMergeQueueEnabled: true }));
    expect(req.mergeQueue).toEqual({ required: true, enabled: true, inQueue: false });
  });
});

describe("formatMergeRequirementLines extra branches", () => {
  it("formats current approvals with and without a required count", () => {
    expect(
      formatMergeRequirementLines(
        deriveMergeRequirements(
          makePr({
            latestReviews: [{ login: "a", state: "APPROVED" }],
            branchRules: { ...EMPTY_BRANCH_RULES, requiredApprovingReviewCount: 2 },
          }),
        ),
      )[0],
    ).toBe("Approvals: 1/2 [Required]");
    expect(
      formatMergeRequirementLines(
        deriveMergeRequirements(makePr({ latestReviews: [{ login: "a", state: "APPROVED" }] })),
      )[0],
    ).toBe("Approvals: 1 [Not Required]");
  });

  it("formats remaining required-only header lines", () => {
    const lines = formatMergeRequirementLines(
      deriveMergeRequirements(
        makePr({
          branchRules: {
            ...EMPTY_BRANCH_RULES,
            requiresCodeOwnerReviews: true,
            requiresLastPushApproval: true,
            requiresCommitSignatures: true,
            requiresLinearHistory: true,
            requiresStrictStatusChecks: true,
            requiredStatusCheckContexts: ["ci"],
            requiredDeploymentEnvironments: ["prod"],
            requiresWorkflows: true,
            requiresCodeScanning: true,
          },
        }),
      ),
    );
    expect(lines).toEqual(
      expect.arrayContaining([
        "Code owner review: [Required]",
        "Last-push approval: [Required]",
        "Signed commits: [Required]",
        "Linear history: [Required]",
        "Branch up to date: Yes [Required]",
        "Required status checks: 1 [Required]",
        "Required deployments: prod [Required]",
        "Required workflows: [Required]",
        "Code scanning: [Required]",
      ]),
    );
  });

  it("formats merge queue without a position and the unused not-required branch", () => {
    expect(
      formatMergeRequirementLines(
        deriveMergeRequirements(makePr({ isInMergeQueue: true, mergeQueueEntry: null })),
      ),
    ).toContain("Merge queue: Yes [Not Required]");
    expect(
      formatMergeRequirementLines({
        approvals: { current: 0, requiredCount: 0 },
        conversationsResolved: { resolved: true, unresolvedCount: 0, required: false },
        mergeQueue: { required: false, enabled: false, inQueue: false },
      }),
    ).toContain("Merge queue: No [Not Required]");
  });
});

describe("blockedReasonFromRequirements extra branches", () => {
  it("describes unresolved conversations, behind branch, and required queue", () => {
    expect(
      blockedReasonFromRequirements(
        deriveMergeRequirements(
          makePr({
            branchRules: { ...EMPTY_BRANCH_RULES, requiresConversationResolution: true },
            reviewThreads: [unresolvedThread],
          }),
        ),
      ),
    ).toContain("unresolved conversations are required");
    expect(
      blockedReasonFromRequirements(
        deriveMergeRequirements(
          makePr({
            mergeStateStatus: "BEHIND",
            branchRules: { ...EMPTY_BRANCH_RULES, requiresStrictStatusChecks: true },
          }),
        ),
      ),
    ).toContain("branch is behind base");
    expect(
      blockedReasonFromRequirements(deriveMergeRequirements(makePr({ isMergeQueueEnabled: true }))),
    ).toContain("merge queue is required");
    expect(
      blockedReasonFromRequirements(
        deriveMergeRequirements(makePr({ isInMergeQueue: true, mergeQueueEntry: null })),
      ),
    ).toBe("in merge queue");
    const met = deriveMergeRequirements(
      makePr({
        latestReviews: [{ login: "a", state: "APPROVED" }],
        branchRules: { ...EMPTY_BRANCH_RULES, requiredApprovingReviewCount: 1 },
      }),
    );
    expect(blockedReasonFromRequirements(met)).toBeNull();
  });
});
