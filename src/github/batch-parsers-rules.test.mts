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
          requireLastPushApproval: false,
          requiresCommitSignatures: true,
          requiresLinearHistory: false,
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
    expect(rules.requiresCommitSignatures).toBe(true);
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
            { type: "MERGE_QUEUE", parameters: null },
            { type: "WORKFLOWS", parameters: null },
            { type: "CODE_SCANNING", parameters: null },
          ],
        },
      }),
    );
    expect(rules.requiredApprovingReviewCount).toBe(1);
    expect(rules.requiresConversationResolution).toBe(true);
    expect(rules.requiresLastPushApproval).toBe(true);
    expect(rules.requiresMergeQueue).toBe(true);
    expect(rules.requiresWorkflows).toBe(true);
    expect(rules.requiresCodeScanning).toBe(true);
  });
});

describe("parseMergeQueueEntry / parseStack", () => {
  it("returns null merge queue entry when absent", () => {
    expect(parseMergeQueueEntry(null)).toBeNull();
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
