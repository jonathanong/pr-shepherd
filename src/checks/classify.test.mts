import { describe, it, expect } from "vitest";
import { classifyChecks, getCiVerdict } from "./classify.mts";
import type { CheckRun } from "../types.mts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeCheck(overrides: Partial<CheckRun>): CheckRun {
  return {
    name: "tests",
    status: "COMPLETED",
    conclusion: "SUCCESS",
    detailsUrl: "https://github.com/owner/repo/actions/runs/123/jobs/456",
    event: "pull_request",
    runId: "123",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// classifyChecks
// ---------------------------------------------------------------------------

describe("classifyChecks — event filtering", () => {
  it("keeps pull_request checks", () => {
    const [c] = classifyChecks([makeCheck({ event: "pull_request" })]);
    expect(c!.category).not.toBe("filtered");
  });

  it("keeps pull_request_target checks", () => {
    const [c] = classifyChecks([makeCheck({ event: "pull_request_target" })]);
    expect(c!.category).not.toBe("filtered");
  });

  it("filters push-triggered checks", () => {
    const [c] = classifyChecks([makeCheck({ event: "push" })]);
    expect(c!.category).toBe("filtered");
  });

  it("filters merge_group-triggered checks", () => {
    const [c] = classifyChecks([makeCheck({ event: "merge_group" })]);
    expect(c!.category).toBe("filtered");
  });

  it("filters schedule-triggered checks", () => {
    const [c] = classifyChecks([makeCheck({ event: "schedule" })]);
    expect(c!.category).toBe("filtered");
  });

  it("filters workflow_dispatch checks", () => {
    const [c] = classifyChecks([makeCheck({ event: "workflow_dispatch" })]);
    expect(c!.category).toBe("filtered");
  });

  it("keeps checks with null event (StatusContext nodes, no event available)", () => {
    const [c] = classifyChecks([makeCheck({ event: null })]);
    expect(c!.category).not.toBe("filtered");
  });
});

describe("classifyChecks — conclusion mapping", () => {
  it("classifies SUCCESS as passed", () => {
    const [c] = classifyChecks([makeCheck({ conclusion: "SUCCESS" })]);
    expect(c!.category).toBe("passed");
  });

  it("classifies SKIPPED as skipped", () => {
    const [c] = classifyChecks([makeCheck({ conclusion: "SKIPPED" })]);
    expect(c!.category).toBe("skipped");
  });

  it("classifies NEUTRAL as skipped", () => {
    const [c] = classifyChecks([makeCheck({ conclusion: "NEUTRAL" })]);
    expect(c!.category).toBe("skipped");
  });

  it("classifies FAILURE as failing", () => {
    const [c] = classifyChecks([makeCheck({ conclusion: "FAILURE" })]);
    expect(c!.category).toBe("failing");
  });

  it("classifies TIMED_OUT as failing", () => {
    const [c] = classifyChecks([makeCheck({ conclusion: "TIMED_OUT" })]);
    expect(c!.category).toBe("failing");
  });

  it("classifies CANCELLED as failing", () => {
    const [c] = classifyChecks([makeCheck({ conclusion: "CANCELLED" })]);
    expect(c!.category).toBe("failing");
  });

  it("classifies ACTION_REQUIRED as failing", () => {
    const [c] = classifyChecks([makeCheck({ conclusion: "ACTION_REQUIRED" })]);
    expect(c!.category).toBe("failing");
  });

  it("classifies in-progress check (QUEUED) as in_progress", () => {
    const [c] = classifyChecks([makeCheck({ status: "QUEUED", conclusion: null })]);
    expect(c!.category).toBe("in_progress");
  });

  it("classifies in-progress check (IN_PROGRESS) as in_progress", () => {
    const [c] = classifyChecks([makeCheck({ status: "IN_PROGRESS", conclusion: null })]);
    expect(c!.category).toBe("in_progress");
  });
});

// ---------------------------------------------------------------------------
// getCiVerdict
// ---------------------------------------------------------------------------

describe("getCiVerdict", () => {
  it("returns allPassed true when all relevant checks passed", () => {
    const classified = classifyChecks([
      makeCheck({ conclusion: "SUCCESS" }),
      makeCheck({ name: "lint", conclusion: "SUCCESS" }),
    ]);
    const verdict = getCiVerdict(classified);
    expect(verdict.allPassed).toBe(true);
    expect(verdict.anyFailing).toBe(false);
    expect(verdict.anyInProgress).toBe(false);
  });

  it("returns anyFailing when a check failed", () => {
    const classified = classifyChecks([
      makeCheck({ conclusion: "SUCCESS" }),
      makeCheck({ name: "lint", conclusion: "FAILURE" }),
    ]);
    const verdict = getCiVerdict(classified);
    expect(verdict.anyFailing).toBe(true);
    expect(verdict.allPassed).toBe(false);
  });

  it("returns anyInProgress when a check is still running", () => {
    const classified = classifyChecks([
      makeCheck({ conclusion: "SUCCESS" }),
      makeCheck({ name: "tests", status: "IN_PROGRESS", conclusion: null }),
    ]);
    const verdict = getCiVerdict(classified);
    expect(verdict.anyInProgress).toBe(true);
    expect(verdict.allPassed).toBe(false);
  });

  it("ignores filtered and skipped checks in the verdict", () => {
    const classified = classifyChecks([
      makeCheck({ event: "push", conclusion: "FAILURE" }), // filtered
      makeCheck({ conclusion: "SKIPPED" }), // skipped
      makeCheck({ name: "tests", conclusion: "SUCCESS" }), // passes
    ]);
    const verdict = getCiVerdict(classified);
    expect(verdict.allPassed).toBe(true);
    expect(verdict.anyFailing).toBe(false);
  });

  it("returns allPassed true when no relevant checks exist (e.g. docs-only PR)", () => {
    // Only filtered checks — no relevant checks → allPassed true (nothing to fail).
    const classified = classifyChecks([makeCheck({ event: "push", conclusion: "SUCCESS" })]);
    const verdict = getCiVerdict(classified);
    expect(verdict.allPassed).toBe(true);
    expect(verdict.anyFailing).toBe(false);
    expect(verdict.anyInProgress).toBe(false);
  });
});
