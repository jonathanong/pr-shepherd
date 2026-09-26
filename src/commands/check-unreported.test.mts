import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShepherdReport } from "../types.mts";

vi.mock("../github/merge-target-rules.mts", () => ({ loadMergeTargetStatus: vi.fn() }));

import { loadMergeTargetStatus } from "../github/merge-target-rules.mts";
import { refreshCachedUnreported } from "./check-unreported.mts";

const target = vi.mocked(loadMergeTargetStatus);

function report(overrides: Partial<ShepherdReport> = {}): ShepherdReport {
  return {
    pr: 622,
    repo: "acme/widgets",
    baseBranch: "feature-parent",
    headRefName: "feature",
    status: "READY",
    checks: {
      passing: [{ name: "gitleaks" }],
      failing: [],
      inProgress: [],
      skipped: [],
      filtered: [],
      filteredNames: [],
      blockedByFilteredCheck: false,
      supersededNames: ["lint"],
    },
    mergeStatus: {
      status: "BLOCKED",
      state: "OPEN",
      isDraft: false,
      mergeable: "MERGEABLE",
      reviewDecision: null,
      blockingBotReviewInProgress: false,
      mergeStateStatus: "BLOCKED",
      mergeRequirements: {
        stack: { number: 7, size: 2, position: 2, baseRefName: "main" },
        requiredStatusChecks: { contexts: ["build"] },
      },
    },
    unreportedRequiredChecks: ["old"],
    trunkBehindBy: 4,
    ...overrides,
  } as ShepherdReport;
}

describe("refreshCachedUnreported", () => {
  beforeEach(() => target.mockReset());

  it("refreshes a stale trunk compare and keeps READY from hiding missing checks", async () => {
    target.mockResolvedValue({
      contexts: ["build", "tests", "gitleaks"],
      trunkBehindBy: 6,
      stackBottomPr: 613,
    });

    const next = await refreshCachedUnreported(report(), { owner: "acme", name: "widgets" });

    expect(next.status).toBe("PENDING");
    expect(next.unreportedRequiredChecks).toEqual(["build", "tests"]);
    expect(next.trunkBehindBy).toBe(6);
    expect(next.stackBottomPr).toBe(613);
  });

  it("clears the cached names once every required context has a check", async () => {
    target.mockResolvedValue({ contexts: ["gitleaks"], stackBottomPr: 613 });

    const next = await refreshCachedUnreported(report({ status: "PENDING" }), {
      owner: "acme",
      name: "widgets",
    });

    expect(next.unreportedRequiredChecks).toBeUndefined();
    expect(next.trunkBehindBy).toBeUndefined();
    expect(next.stackBottomPr).toBe(613);
    expect(next.status).toBe("PENDING");
  });
});
