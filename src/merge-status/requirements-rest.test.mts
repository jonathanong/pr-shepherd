import { describe, expect, it } from "vitest";
import type { BatchPrData } from "../types.mts";
import { EMPTY_BRANCH_RULES } from "../github/batch-parsers-rules.mts";
import { deriveMergeRequirements } from "./requirements.mts";
import type { IterateResult } from "../types.mts";
import { formatIterateResult } from "../cli/iterate-formatter.mts";
import { projectIterateLean } from "../cli/iterate-lean.mts";
import {
  blockedReasonFromRequirements,
  formatMergeRequirementLines,
} from "./requirements-format.mts";

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

describe("REST merge requirements", () => {
  it("keeps queue membership unknown when queue policy is known but membership is unavailable", () => {
    const req = deriveMergeRequirements(
      makePr({
        transport: "rest",
        branchRules: { ...EMPTY_BRANCH_RULES, requiresMergeQueue: true },
        isInMergeQueue: undefined,
        isMergeQueueEnabled: undefined,
      }),
    );
    expect(req.mergeQueue).toEqual({ required: true });
    expect(formatMergeRequirementLines(req)).toContain("Merge queue: Unknown [Required]");
  });
  it("does not invent zero requirements or resolved state when evidence is unavailable", () => {
    const req = deriveMergeRequirements(
      makePr({
        transport: "rest",
        transportUnavailable: [
          { field: "branchProtection", reason: "not readable" },
          { field: "reviewThreads.status", reason: "CCR unavailable" },
        ],
        reviewThreads: [{ ...unresolvedThread, isResolved: undefined, isOutdated: undefined }],
      }),
    );

    expect(req.approvals).toEqual({ current: 0 });
    expect(req.conversationsResolved).toEqual({});
    expect(formatMergeRequirementLines(req)).toEqual([
      "Approvals: None [Requirement Unknown]",
      "Conversations Resolved: Unknown [Requirement Unknown]",
    ]);
    expect(blockedReasonFromRequirements(req)).toBeNull();

    const report = {
      action: "wait",
      pr: 42,
      repo: "owner/repo",
      transport: "rest",
      status: "UNKNOWN",
      state: "OPEN",
      mergeStateStatus: "CLEAN",
      mergeStatus: "CLEAN",
      reviewDecision: null,
      blockingBotReviewInProgress: false,
      isDraft: false,
      shouldCancel: false,
      remainingSeconds: 0,
      summary: { passing: 0, skipped: 0, filtered: 0, inProgress: 0, superseded: 0 },
      baseBranch: "main",
      branchProtection: null,
      checks: [],
      mergeRequirements: req,
      log: "waiting",
    } as IterateResult;
    const json = projectIterateLean(report) as { mergeRequirements: typeof req };
    expect(json.mergeRequirements.approvals).toEqual({ current: 0 });
    expect(formatIterateResult(report)).toContain("[Requirement Unknown]");
    expect(formatIterateResult(report)).toContain("Conversations Resolved: Unknown");
  });

  it("reports known unresolved threads without claiming policy is known", () => {
    const req = deriveMergeRequirements(
      makePr({
        transport: "rest",
        transportUnavailable: [{ field: "branchRules", reason: "not readable" }],
        reviewThreads: [unresolvedThread],
      }),
    );

    expect(req.conversationsResolved).toEqual({ resolved: false, unresolvedCount: 1 });
    expect(formatMergeRequirementLines(req)[1]).toBe(
      "Conversations Resolved: No [Requirement Unknown]",
    );
  });
});
