// @ts-nocheck
import { describe, expect, it } from "vitest";

import { computeStatus } from "./check-status.mts";
import type { CiVerdict } from "../checks/classify.mts";
import type { MergeStatusResult } from "../types.mts";

const cleanMerge: MergeStatusResult = {
  status: "CLEAN",
  state: "OPEN",
  isDraft: false,
  mergeable: "MERGEABLE",
  reviewDecision: "APPROVED",
  blockingBotReviewInProgress: false,
  mergeStateStatus: "CLEAN",
};

const passingVerdict: CiVerdict = {
  anyFailing: false,
  anyInProgress: false,
  allPassed: true,
  hasChecks: true,
  filteredNames: [],
};

describe("computeStatus", () => {
  it("returns UNKNOWN for unknown merge states that have no other blockers", () => {
    expect(computeStatus(passingVerdict, 0, 0, { ...cleanMerge, status: "UNKNOWN" }, 0)).toBe(
      "UNKNOWN",
    );
  });

  it("returns UNRESOLVED_COMMENTS for review work after CI and merge state are clear", () => {
    expect(computeStatus(passingVerdict, 1, 0, cleanMerge, 0)).toBe("UNRESOLVED_COMMENTS");
    expect(computeStatus(passingVerdict, 0, 1, cleanMerge, 0)).toBe("UNRESOLVED_COMMENTS");
    expect(computeStatus(passingVerdict, 0, 0, cleanMerge, 1)).toBe("UNRESOLVED_COMMENTS");
  });

  it("returns UNKNOWN when clean but CI has not passed", () => {
    expect(
      computeStatus({ ...passingVerdict, allPassed: false, hasChecks: true }, 0, 0, cleanMerge, 0),
    ).toBe("UNKNOWN");
  });

  it("returns READY for draft PRs when checks have passed and no review work remains", () => {
    expect(computeStatus(passingVerdict, 0, 0, { ...cleanMerge, status: "DRAFT" }, 0)).toBe(
      "READY",
    );
  });
});
