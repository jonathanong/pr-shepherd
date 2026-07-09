import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockLoadConfig } = vi.hoisted(() => ({ mockLoadConfig: vi.fn() }));
vi.mock("../config/load.mts", () => ({ loadConfig: mockLoadConfig }));

import { classifyChecks, getCiVerdict } from "./classify.mts";
import type { CheckRun } from "../types.mts";

const baseCheck: CheckRun = {
  name: "tests",
  status: "COMPLETED",
  conclusion: "SUCCESS",
  detailsUrl: "",
  event: "pull_request",
  runId: null,
};

function config(ignoreChecks: string[] = []) {
  return {
    ignoreChecks,
    checks: { ciTriggerEvents: ["pull_request", "pull_request_target"] },
    actions: { neverCancelRuns: [] },
  };
}

beforeEach(() => {
  mockLoadConfig.mockReturnValue(config());
});

describe("classifyChecks — ignoreChecks", () => {
  it("marks case-insensitive glob matches as 'ignored' and excludes them from verdicts", () => {
    mockLoadConfig.mockReturnValue(config(["kilo*"]));
    const classified = classifyChecks([
      { ...baseCheck, name: "Kilo Code Review", conclusion: "FAILURE" },
      baseCheck,
    ]);
    expect(classified.find((c) => c.name === "Kilo Code Review")?.category).toBe("ignored");
    expect(classified.find((c) => c.name === "tests")?.category).toBe("passed");
    const verdict = getCiVerdict(classified);
    expect(verdict.allPassed).toBe(true);
    expect(verdict.anyFailing).toBe(false);
    expect(verdict.anyInProgress).toBe(false);
    expect(verdict.ignoredNames).toEqual(["Kilo Code Review"]);
  });

  it("does not ignore a GitHub Actions check protected by workflow name", () => {
    mockLoadConfig.mockReturnValue({
      ...config(["Claude Code Review"]),
      actions: { neverCancelRuns: ["Final Code Review"] },
    });
    const classified = classifyChecks([
      {
        ...baseCheck,
        name: "Claude Code Review",
        status: "IN_PROGRESS",
        conclusion: null,
        runId: "run-final-review",
        workflowName: "Final Code Review",
      },
    ]);
    expect(classified[0]?.category).toBe("in_progress");
    const verdict = getCiVerdict(classified);
    expect(verdict.anyInProgress).toBe(true);
    expect(verdict.ignoredNames).toEqual([]);
  });

  it("still ignores the same raw check name when no protected workflow matches", () => {
    mockLoadConfig.mockReturnValue(config(["Claude Code Review"]));
    const classified = classifyChecks([
      {
        ...baseCheck,
        name: "Claude Code Review",
        status: "IN_PROGRESS",
        conclusion: null,
        runId: "run-final-review",
        workflowName: "Final Code Review",
      },
    ]);
    expect(classified[0]?.category).toBe("ignored");
  });
});
