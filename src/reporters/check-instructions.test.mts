import { describe, it, expect } from "vitest";
import { buildCheckInstructions } from "./check-instructions.mts";
import type { ShepherdReport, ClassifiedCheck, TriagedCheck } from "../types.mts";

function makeCheck(overrides: Partial<ClassifiedCheck> = {}): ClassifiedCheck {
  return {
    name: "ci / tests",
    status: "COMPLETED",
    conclusion: "SUCCESS",
    detailsUrl: "",
    event: "pull_request",
    runId: null,
    category: "passed",
    ...overrides,
  };
}

function makeReport(overrides: Partial<ShepherdReport> = {}): ShepherdReport {
  return {
    pr: 42,
    nodeId: "PR_kgDOAAA",
    repo: "owner/repo",
    status: "READY",
    baseBranch: "main",
    mergeStatus: {
      status: "CLEAN",
      state: "OPEN",
      isDraft: false,
      mergeable: "MERGEABLE",
      reviewDecision: "APPROVED",
      copilotReviewInProgress: false,
      mergeStateStatus: "CLEAN",
    },
    checks: {
      passing: [makeCheck()],
      failing: [],
      inProgress: [],
      skipped: [],
      filtered: [],
      filteredNames: [],
      blockedByFilteredCheck: false,
    },
    threads: { actionable: [], autoResolved: [], autoResolveErrors: [] },
    comments: { actionable: [] },
    changesRequestedReviews: [],
    reviewSummaries: [],
    approvedReviews: [],
    ...overrides,
  };
}

describe("buildCheckInstructions — summary", () => {
  it("includes merge status in summary", () => {
    const steps = buildCheckInstructions(makeReport());
    expect(steps[0]).toContain("CLEAN");
  });

  it("includes CI pass count in summary", () => {
    const steps = buildCheckInstructions(makeReport());
    expect(steps[0]).toContain("1/1 passed");
  });

  it("includes failing count in summary when non-zero", () => {
    const failing: TriagedCheck = {
      ...makeCheck({ category: "failing", conclusion: "FAILURE" }),
      failureKind: "actionable",
    };
    const report = makeReport({ checks: { ...makeReport().checks, failing: [failing] } });
    const steps = buildCheckInstructions(report);
    expect(steps[0]).toContain("1 failing");
  });

  it("mentions copilot review in progress when true", () => {
    const report = makeReport({
      mergeStatus: { ...makeReport().mergeStatus, copilotReviewInProgress: true },
    });
    const steps = buildCheckInstructions(report);
    expect(steps[0]).toContain("Copilot review in progress");
  });

  it("includes actionable item count", () => {
    const steps = buildCheckInstructions(makeReport());
    expect(steps[0]).toContain("0 actionable review item(s)");
  });
});

describe("buildCheckInstructions — rebase policy", () => {
  it("emits rebase-required for CONFLICTS", () => {
    const report = makeReport({
      mergeStatus: {
        ...makeReport().mergeStatus,
        status: "CONFLICTS",
        mergeStateStatus: "DIRTY",
      },
    });
    const steps = buildCheckInstructions(report);
    expect(steps.some((s) => s.includes("Rebase required"))).toBe(true);
  });

  it("emits rebase-optional for BEHIND + actionable failure", () => {
    const failing: TriagedCheck = {
      ...makeCheck({ name: "tests", category: "failing", conclusion: "FAILURE" }),
      failureKind: "actionable",
    };
    const report = makeReport({
      mergeStatus: { ...makeReport().mergeStatus, status: "BEHIND" },
      checks: { ...makeReport().checks, failing: [failing] },
    });
    const steps = buildCheckInstructions(report);
    expect(steps.some((s) => s.includes("A rebase is optional"))).toBe(true);
  });

  it("emits rebase-optional for BEHIND + no flaky failures", () => {
    const report = makeReport({
      mergeStatus: { ...makeReport().mergeStatus, status: "BEHIND" },
    });
    const steps = buildCheckInstructions(report);
    expect(steps.some((s) => s.includes("A rebase is optional"))).toBe(true);
  });

  it("emits no rebase step for CLEAN", () => {
    const steps = buildCheckInstructions(makeReport());
    expect(steps.some((s) => s.toLowerCase().includes("rebase"))).toBe(false);
  });
});

describe("buildCheckInstructions — CI budget policy", () => {
  it("emits fix-code for actionable failure", () => {
    const failing: TriagedCheck = {
      ...makeCheck({ name: "lint", category: "failing", conclusion: "FAILURE" }),
      failureKind: "actionable",
    };
    const report = makeReport({ checks: { ...makeReport().checks, failing: [failing] } });
    const steps = buildCheckInstructions(report);
    expect(steps.some((s) => s.includes("Fix code failure") && s.includes("lint"))).toBe(true);
  });

  it("emits rerun with runId for cancelled failure", () => {
    const failing: TriagedCheck = {
      ...makeCheck({ name: "build", category: "failing", conclusion: "CANCELLED", runId: "99999" }),
      failureKind: "cancelled",
    };
    const report = makeReport({ checks: { ...makeReport().checks, failing: [failing] } });
    const steps = buildCheckInstructions(report);
    expect(steps.some((s) => s.includes("gh run rerun 99999 --failed"))).toBe(true);
  });

  it("emits rerun with placeholder when runId is null", () => {
    const failing: TriagedCheck = {
      ...makeCheck({ name: "build", category: "failing", conclusion: "TIMED_OUT", runId: null }),
      failureKind: "timeout",
    };
    const report = makeReport({ checks: { ...makeReport().checks, failing: [failing] } });
    const steps = buildCheckInstructions(report);
    expect(steps.some((s) => s.includes("gh run rerun <runId> --failed"))).toBe(true);
  });

  it("emits no CI budget steps when no failing checks", () => {
    const steps = buildCheckInstructions(makeReport());
    expect(
      steps.some(
        (s) => s.includes("Fix code") || s.includes("Re-run") || s.includes("Do not cancel"),
      ),
    ).toBe(false);
  });
});

describe("buildCheckInstructions — ready-to-merge gate", () => {
  it("declares ready when CLEAN + READY + no copilot", () => {
    const steps = buildCheckInstructions(makeReport());
    expect(steps.some((s) => s.includes("ready to merge"))).toBe(true);
  });

  it("blocks when status is not READY", () => {
    const report = makeReport({ status: "FAILING" });
    const steps = buildCheckInstructions(report);
    expect(steps.some((s) => s.includes("Do not declare") && s.includes("FAILING"))).toBe(true);
  });

  it("blocks when mergeStateStatus is not CLEAN", () => {
    const report = makeReport({
      mergeStatus: { ...makeReport().mergeStatus, mergeStateStatus: "BLOCKED" },
    });
    const steps = buildCheckInstructions(report);
    expect(steps.some((s) => s.includes("Do not declare") && s.includes("BLOCKED"))).toBe(true);
  });

  it("blocks when copilotReviewInProgress is true", () => {
    const report = makeReport({
      mergeStatus: { ...makeReport().mergeStatus, copilotReviewInProgress: true },
    });
    const steps = buildCheckInstructions(report);
    expect(steps.some((s) => s.includes("Do not declare") && s.includes("Copilot"))).toBe(true);
  });
});

describe("buildCheckInstructions — monitoring pointer", () => {
  it("includes a /pr-shepherd:monitor pointer for non-READY PRs", () => {
    const steps = buildCheckInstructions(makeReport({ status: "FAILING" }));
    expect(steps[steps.length - 1]).toContain("/pr-shepherd:monitor");
  });

  it("omits the /pr-shepherd:monitor pointer for READY PRs", () => {
    const steps = buildCheckInstructions(makeReport({ status: "READY" }));
    expect(steps.every((s) => !s.includes("/pr-shepherd:monitor"))).toBe(true);
  });
});
