import { describe, it, expect } from "vitest";
import {
  EMPTY_BRANCH_RULES,
  parseBranchRules,
  parseMergeQueueEntry,
  parseStack,
} from "./batch-parsers-rules.mts";
import type { RawBaseRef } from "./batch-raw-rules.mts";
import type { RawPrMergeFields } from "./batch-raw-rules.mts";

function makeBaseRef(overrides: Partial<RawBaseRef> = {}): RawBaseRef {
  return { branchProtectionRule: null, rules: { nodes: [] }, ...overrides };
}

describe("parseBranchRules", () => {
  it("returns empty rules when baseRef is null", () => {
    expect(parseBranchRules(null)).toEqual(EMPTY_BRANCH_RULES);
  });

  it("folds classic branch protection", () => {
    const rules = parseBranchRules(
      makeBaseRef({
        branchProtectionRule: {
          requiresApprovingReviews: true,
          requiredApprovingReviewCount: 2,
          requiresConversationResolution: true,
          requiresCodeOwnerReviews: true,
          requireLastPushApproval: true,
          requiresCommitSignatures: true,
          requiresLinearHistory: true,
          requiresStatusChecks: true,
          requiredStatusCheckContexts: ["ci"],
          requiresStrictStatusChecks: true,
          requiresDeployments: true,
          requiredDeploymentEnvironments: ["prod"],
        },
      }),
    );
    expect(rules.requiredApprovingReviewCount).toBe(2);
    expect(rules.requiresConversationResolution).toBe(true);
    expect(rules.requiresCodeOwnerReviews).toBe(true);
    expect(rules.requiresLastPushApproval).toBe(true);
    expect(rules.requiresCommitSignatures).toBe(true);
    expect(rules.requiresLinearHistory).toBe(true);
    expect(rules.requiresStrictStatusChecks).toBe(true);
    expect(rules.requiredStatusCheckContexts).toEqual(["ci"]);
    expect(rules.requiredDeploymentEnvironments).toEqual(["prod"]);
  });

  it("folds ruleset pull-request and merge-queue rules", () => {
    const rules = parseBranchRules(
      makeBaseRef({
        rules: {
          nodes: [
            {
              type: "PULL_REQUEST",
              parameters: {
                requiredApprovingReviewCount: 1,
                requiredReviewThreadResolution: true,
                requireCodeOwnerReview: false,
                requireLastPushApproval: true,
              },
            },
            {
              type: "PULL_REQUEST",
              parameters: { requireCodeOwnerReview: true },
            },
            { type: "REQUIRED_REVIEW_THREAD_RESOLUTION", parameters: null },
            {
              type: "REQUIRED_STATUS_CHECKS",
              parameters: {
                strictRequiredStatusChecksPolicy: true,
                requiredStatusChecks: [{ context: "lint" }, { context: "" }],
              },
            },
            { type: "REQUIRED_SIGNATURES", parameters: null },
            { type: "REQUIRED_LINEAR_HISTORY", parameters: null },
            {
              type: "REQUIRED_DEPLOYMENTS",
              parameters: { requiredDeploymentEnvironments: ["prod", "prod"] },
            },
            { type: "MERGE_QUEUE", parameters: null },
            { type: "WORKFLOWS", parameters: null },
            { type: "REQUIRED_WORKFLOW_STATUS_CHECKS", parameters: null },
            { type: "CODE_SCANNING", parameters: null },
            { type: "UNKNOWN_RULE", parameters: null },
          ],
        },
      }),
    );
    expect(rules.requiredApprovingReviewCount).toBe(1);
    expect(rules.requiresConversationResolution).toBe(true);
    expect(rules.requiresCodeOwnerReviews).toBe(true);
    expect(rules.requiresLastPushApproval).toBe(true);
    expect(rules.requiresStrictStatusChecks).toBe(true);
    expect(rules.requiredStatusCheckContexts).toEqual(["lint"]);
    expect(rules.requiresCommitSignatures).toBe(true);
    expect(rules.requiresLinearHistory).toBe(true);
    expect(rules.requiredDeploymentEnvironments).toEqual(["prod"]);
    expect(rules.requiresMergeQueue).toBe(true);
    expect(rules.requiresWorkflows).toBe(true);
    expect(rules.requiresCodeScanning).toBe(true);
  });

  it("treats missing classic review-count and check-context lists as empty", () => {
    const rules = parseBranchRules(
      makeBaseRef({
        branchProtectionRule: {
          requiresApprovingReviews: true,
          requiredApprovingReviewCount: 0,
          requiresConversationResolution: false,
          requiresCodeOwnerReviews: false,
          requireLastPushApproval: false,
          requiresCommitSignatures: false,
          requiresLinearHistory: false,
          requiresStatusChecks: true,
          requiredStatusCheckContexts: null,
          requiresStrictStatusChecks: false,
          requiresDeployments: true,
          requiredDeploymentEnvironments: null,
        },
        rules: {
          nodes: [
            { type: "REQUIRED_STATUS_CHECKS", parameters: null },
            { type: "REQUIRED_DEPLOYMENTS", parameters: null },
            { type: "PULL_REQUEST", parameters: null },
          ],
        },
      }),
    );
    expect(rules.requiredApprovingReviewCount).toBe(0);
    expect(rules.requiredStatusCheckContexts).toEqual([]);
    expect(rules.requiredDeploymentEnvironments).toEqual([]);
  });
});

describe("parseMergeQueueEntry / parseStack", () => {
  it("returns null merge queue entry when absent", () => {
    expect(parseMergeQueueEntry(null)).toBeNull();
  });

  it("parses a merge queue entry", () => {
    expect(
      parseMergeQueueEntry({ position: 4, state: "QUEUED", estimatedTimeToMerge: 30 }),
    ).toEqual({ position: 4, state: "QUEUED", estimatedTimeToMerge: 30 });
  });

  it("defaults stack position to 0 when the stack entry is missing", () => {
    expect(parseStack({ stack: { number: 1, size: 1, baseRefName: "main" } })).toEqual({
      number: 1,
      size: 1,
      position: 0,
      baseRefName: "main",
    });
  });

  it("parses stack membership", () => {
    const raw: RawPrMergeFields = {
      stack: { number: 7, size: 3, baseRefName: "main" },
      stackEntry: { position: 2 },
    };
    expect(parseStack(raw)).toEqual({
      number: 7,
      size: 3,
      position: 2,
      baseRefName: "main",
    });
  });
});
