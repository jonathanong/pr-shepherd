import { describe, expect, it } from "vitest";
import { reportAllowsFingerprintSkip } from "./check-fingerprint.mts";
import type { ShepherdReport } from "../types.mts";

function waitReport(overrides: Partial<ShepherdReport> = {}): ShepherdReport {
  return {
    pr: 42,
    nodeId: "PR_1",
    repo: "owner/repo",
    status: "IN_PROGRESS",
    baseBranch: "main",
    mergeStatus: {
      status: "CLEAN",
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
      state: "OPEN",
      isDraft: false,
      reviewDecision: null,
      blockingBotReviewInProgress: false,
    },
    checks: {
      passing: [],
      failing: [],
      inProgress: [],
      skipped: [],
      filtered: [],
      filteredNames: [],
      blockedByFilteredCheck: false,
    },
    threads: { actionable: [], resolutionOnly: [], autoResolved: [], autoResolveErrors: [], firstLook: [] },
    comments: { actionable: [], firstLook: [] },
    changesRequestedReviews: [],
    reviewSummaries: [],
    firstLookSummaries: [],
    editedSummaries: [],
    approvedReviews: [],
    branchProtection: null,
    ...overrides,
  };
}

describe("reportAllowsFingerprintSkip", () => {
  it("allows a quiet open WAIT-shaped report", () => {
    expect(reportAllowsFingerprintSkip(waitReport())).toBe(true);
  });

  it("rejects first-look threads so they are not re-surfaced from cache", () => {
    expect(
      reportAllowsFingerprintSkip(
        waitReport({
          threads: {
            actionable: [],
            resolutionOnly: [],
            autoResolved: [],
            autoResolveErrors: [],
            firstLook: [{ id: "t1" } as ShepherdReport["threads"]["firstLook"][number]],
          },
        }),
      ),
    ).toBe(false);
  });

  it("rejects failing checks", () => {
    expect(
      reportAllowsFingerprintSkip(
        waitReport({
          checks: {
            passing: [],
            failing: [{ name: "CI" } as ShepherdReport["checks"]["failing"][number]],
            inProgress: [],
            skipped: [],
            filtered: [],
            filteredNames: [],
            blockedByFilteredCheck: false,
          },
        }),
      ),
    ).toBe(false);
  });
});
