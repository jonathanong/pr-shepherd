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
    threads: { actionable: [], autoResolved: [], autoResolveErrors: [], firstLook: [] },
    comments: { actionable: [], firstLook: [] },
    changesRequestedReviews: [],
    reviewSummaries: [],
    firstLookSummaries: [],
    editedSummaries: [],
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
  it("emits failing-check instruction for any failure (not gated on failureKind)", () => {
    const failing: TriagedCheck = {
      ...makeCheck({ name: "lint", category: "failing", conclusion: "FAILURE" }),
    };
    const report = makeReport({ checks: { ...makeReport().checks, failing: [failing] } });
    const steps = buildCheckInstructions(report);
    expect(steps.some((s) => s.includes("Failing check:") && s.includes("lint"))).toBe(true);
  });

  it("emits rerun hint with runId for check that has a runId but no logTail", () => {
    const failing: TriagedCheck = {
      ...makeCheck({ name: "build", category: "failing", conclusion: "CANCELLED", runId: "99999" }),
    };
    const report = makeReport({ checks: { ...makeReport().checks, failing: [failing] } });
    const steps = buildCheckInstructions(report);
    expect(steps.some((s) => s.includes("gh run view 99999 --log-failed"))).toBe(true);
    expect(steps.some((s) => s.includes("gh run rerun 99999 --failed"))).toBe(true);
  });

  it("emits 'examine the log tail' when logTail is present with runId", () => {
    const failing: TriagedCheck = {
      ...makeCheck({ name: "build", category: "failing", conclusion: "FAILURE", runId: "99999" }),
      logTail: "some failure output",
    };
    const report = makeReport({ checks: { ...makeReport().checks, failing: [failing] } });
    const steps = buildCheckInstructions(report);
    expect(steps.some((s) => s.includes("examine the log tail"))).toBe(true);
    expect(steps.some((s) => s.includes("gh run rerun 99999 --failed"))).toBe(true);
  });

  it("includes failedStep hint in instruction when failedStep is set (logTail absent)", () => {
    const failing: TriagedCheck = {
      ...makeCheck({ name: "ci", category: "failing", conclusion: "FAILURE", runId: "12345" }),
      failedStep: "Run tests",
    };
    const report = makeReport({ checks: { ...makeReport().checks, failing: [failing] } });
    const steps = buildCheckInstructions(report);
    expect(steps.some((s) => s.includes("Run tests") && s.includes("gh run view 12345"))).toBe(
      true,
    );
  });

  it("includes failedStep hint in instruction when failedStep is set (logTail present)", () => {
    const failing: TriagedCheck = {
      ...makeCheck({ name: "ci", category: "failing", conclusion: "FAILURE", runId: "12345" }),
      failedStep: "Run tests",
      logTail: "error output here",
    };
    const report = makeReport({ checks: { ...makeReport().checks, failing: [failing] } });
    const steps = buildCheckInstructions(report);
    expect(steps.some((s) => s.includes("Run tests") && s.includes("examine the log tail"))).toBe(
      true,
    );
  });

  it("emits open-details-url hint when runId is null but detailsUrl is present", () => {
    const failing: TriagedCheck = {
      ...makeCheck({
        name: "codecov/patch",
        category: "failing",
        conclusion: "FAILURE",
        runId: null,
        detailsUrl: "https://app.codecov.io/gh/owner/repo/pull/42",
      }),
    };
    const report = makeReport({ checks: { ...makeReport().checks, failing: [failing] } });
    const steps = buildCheckInstructions(report);
    expect(
      steps.some(
        (s) =>
          s.includes("open the check details") &&
          s.includes("https://app.codecov.io/gh/owner/repo/pull/42"),
      ),
    ).toBe(true);
  });

  it("emits escalate-to-human hint when runId and detailsUrl are both absent", () => {
    const failing: TriagedCheck = {
      ...makeCheck({ name: "build", category: "failing", conclusion: "TIMED_OUT", runId: null }),
    };
    const report = makeReport({ checks: { ...makeReport().checks, failing: [failing] } });
    const steps = buildCheckInstructions(report);
    expect(steps.some((s) => s.includes("escalate to a human"))).toBe(true);
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

  it("omits the /pr-shepherd:monitor pointer when truly ready to merge (CLEAN + READY + no copilot)", () => {
    const steps = buildCheckInstructions(makeReport({ status: "READY" }));
    expect(steps.every((s) => !s.includes("/pr-shepherd:monitor"))).toBe(true);
  });

  it("includes the /pr-shepherd:monitor pointer when status=READY but mergeStateStatus is not CLEAN (e.g. draft)", () => {
    const report = makeReport({
      status: "READY",
      mergeStatus: { ...makeReport().mergeStatus, mergeStateStatus: "DRAFT", isDraft: true },
    });
    const steps = buildCheckInstructions(report);
    expect(steps.some((s) => s.includes("/pr-shepherd:monitor"))).toBe(true);
  });

  it("includes the /pr-shepherd:monitor pointer when status=READY but copilot review in progress", () => {
    const report = makeReport({
      status: "READY",
      mergeStatus: { ...makeReport().mergeStatus, copilotReviewInProgress: true },
    });
    const steps = buildCheckInstructions(report);
    expect(steps.some((s) => s.includes("/pr-shepherd:monitor"))).toBe(true);
  });
});
