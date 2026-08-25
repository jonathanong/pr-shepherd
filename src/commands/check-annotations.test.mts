import { describe, expect, it } from "vitest";
import { checksWithActionableAnnotations } from "./check-annotations.mts";
import type { ClassifiedCheck, ShepherdReport } from "../types.mts";

function check(overrides: Partial<ClassifiedCheck> = {}): ClassifiedCheck {
  return {
    id: "CR_1",
    name: "tests",
    status: "COMPLETED",
    conclusion: "SUCCESS",
    detailsUrl: "",
    event: "pull_request",
    runId: null,
    category: "passed",
    ...overrides,
  };
}

function emptyReport(overrides: Partial<ShepherdReport["checks"]> = {}): ShepherdReport {
  return {
    pr: 42,
    nodeId: "PR_1",
    repo: "owner/repo",
    status: "READY",
    baseBranch: "main",
    mergeStatus: {
      status: "CLEAN",
      state: "OPEN",
      isDraft: false,
      mergeable: "MERGEABLE",
      reviewDecision: "APPROVED",
      blockingBotReviewInProgress: false,
      mergeStateStatus: "CLEAN",
    },
    checks: {
      passing: [],
      failing: [],
      inProgress: [],
      skipped: [],
      filtered: [],
      filteredNames: [],
      blockedByFilteredCheck: false,
      ...overrides,
    },
    threads: {
      actionable: [],
      resolutionOnly: [],
      autoResolved: [],
      autoResolveErrors: [],
      firstLook: [],
    },
    comments: { actionable: [], firstLook: [] },
    changesRequestedReviews: [],
    reviewSummaries: [],
    firstLookSummaries: [],
    editedSummaries: [],
    approvedReviews: [],
    branchProtection: null,
  };
}

describe("checksWithActionableAnnotations", () => {
  it("collects annotated non-passing checks but excludes successful checks", () => {
    const annotation = {
      id: "check_annotation_1",
      path: "src/a.mts",
      startLine: 1,
      endLine: 1,
      level: "WARNING",
      message: "n",
    };
    const report = emptyReport({
      passing: [check({ annotations: [annotation] })],
      skipped: [
        check({
          id: "CR_skip",
          category: "skipped",
          conclusion: "NEUTRAL",
          annotations: [annotation],
        }),
      ],
      ignored: [
        check({
          id: "CR_ign",
          category: "ignored",
          annotations: [{ ...annotation, id: "check_annotation_ign" }],
        }),
      ],
    });
    expect(checksWithActionableAnnotations(report).map((c) => c.id)).toEqual(["CR_skip", "CR_ign"]);
  });
});
