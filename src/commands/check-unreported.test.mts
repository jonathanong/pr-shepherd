import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShepherdReport } from "../types.mts";

vi.mock("../github/merge-target-rules.mts", () => ({
  loadMergeTargetStatus: vi.fn(),
  loadBaseBehindBy: vi.fn(),
}));

import { loadBaseBehindBy, loadMergeTargetStatus } from "../github/merge-target-rules.mts";
import { refreshCachedUnreported } from "./check-unreported.mts";

const target = vi.mocked(loadMergeTargetStatus);
const behind = vi.mocked(loadBaseBehindBy);

function report(overrides: Partial<ShepherdReport> = {}): ShepherdReport {
  return {
    pr: 622,
    repo: "acme/widgets",
    baseBranch: "feature-parent",
    headRefName: "feature",
    headSha: "b".repeat(40),
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
  beforeEach(() => {
    target.mockReset();
    behind.mockReset();
  });

  it("refreshes a stale trunk compare and keeps READY from hiding missing checks", async () => {
    target.mockResolvedValue({
      contexts: ["build", "tests", "gitleaks"],
      trunkBehindBy: () => Promise.resolve(6),
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

  it("refreshes a non-stack base compare without a second batch", async () => {
    behind.mockResolvedValue(93);
    const next = await refreshCachedUnreported(
      report({
        baseBranch: "main",
        trunkBehindBy: undefined,
        baseBehindBy: 4,
        mergeStatus: {
          status: "BLOCKED",
          state: "OPEN",
          isDraft: false,
          mergeable: "MERGEABLE",
          reviewDecision: null,
          blockingBotReviewInProgress: false,
          mergeStateStatus: "BLOCKED",
        },
      }),
      { owner: "acme", name: "widgets" },
      undefined,
      "b".repeat(40),
    );
    expect(target).not.toHaveBeenCalled();
    expect(behind).toHaveBeenCalledWith("acme", "widgets", "main", expect.any(String), {
      stateKey: { owner: "acme", repo: "widgets", pr: expect.any(Number) },
      baseTipOid: "b".repeat(40),
    });
    expect(next.baseBehindBy).toBe(93);
    expect(next.unreportedRequiredChecks).toEqual(["old"]);
  });

  it("drops a stale base compare once the required checks have reported", async () => {
    const next = await refreshCachedUnreported(
      report({
        unreportedRequiredChecks: undefined,
        trunkBehindBy: undefined,
        baseBehindBy: 4,
        mergeStatus: {
          status: "BLOCKED",
          state: "OPEN",
          isDraft: false,
          mergeable: "MERGEABLE",
          reviewDecision: null,
          blockingBotReviewInProgress: false,
          mergeStateStatus: "BLOCKED",
        },
      }),
      { owner: "acme", name: "widgets" },
    );
    expect(behind).not.toHaveBeenCalled();
    expect(next.baseBehindBy).toBeUndefined();
  });

  it("clears the base compare when the head has caught up", async () => {
    behind.mockResolvedValue(0);
    const next = await refreshCachedUnreported(
      report({
        trunkBehindBy: undefined,
        baseBehindBy: 4,
        mergeStatus: {
          status: "BLOCKED",
          state: "OPEN",
          isDraft: false,
          mergeable: "MERGEABLE",
          reviewDecision: null,
          blockingBotReviewInProgress: false,
          mergeStateStatus: "BLOCKED",
        },
      }),
      { owner: "acme", name: "widgets" },
    );
    expect(next.baseBehindBy).toBeUndefined();
  });

  it("does not compare a branch name when the head commit is unknown", async () => {
    const next = await refreshCachedUnreported(
      report({
        headSha: undefined,
        trunkBehindBy: undefined,
        baseBehindBy: 4,
        mergeStatus: {
          status: "BLOCKED",
          state: "OPEN",
          isDraft: false,
          mergeable: "MERGEABLE",
          reviewDecision: null,
          blockingBotReviewInProgress: false,
          mergeStateStatus: "BLOCKED",
        },
      }),
      { owner: "acme", name: "widgets" },
    );
    expect(behind).not.toHaveBeenCalled();
    expect(next.baseBehindBy).toBe(4);
  });
});
