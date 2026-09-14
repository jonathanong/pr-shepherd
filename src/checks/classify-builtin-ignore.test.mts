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

function config() {
  return {
    ignoreChecks: [] as string[],
    checks: { ciTriggerEvents: ["pull_request", "pull_request_target"] },
    actions: { neverCancelRuns: [] as string[] },
  };
}

beforeEach(() => {
  mockLoadConfig.mockReturnValue(config());
});

describe("classifyChecks — built-in ignores", () => {
  it("ignores CodSpeed app checks without ignoreChecks", () => {
    const classified = classifyChecks([
      {
        ...baseCheck,
        name: "CodSpeed Performance Analysis",
        conclusion: "FAILURE",
        detailsUrl: "https://app.codspeed.io/owner/repo/branches/feat",
      },
      baseCheck,
    ]);
    expect(classified.find((c) => c.name === "CodSpeed Performance Analysis")?.category).toBe(
      "ignored",
    );
    expect(classified.find((c) => c.name === "tests")?.category).toBe("passed");
    const verdict = getCiVerdict(classified);
    expect(verdict.allPassed).toBe(true);
    expect(verdict.anyFailing).toBe(false);
    expect(verdict.ignoredNames).toEqual(["CodSpeed Performance Analysis"]);
  });

  it("ignores Codecov missing-base-report failures without ignoreChecks", () => {
    const classified = classifyChecks([
      {
        ...baseCheck,
        name: "codecov/project/rust",
        conclusion: "FAILURE",
        detailsUrl: "https://app.codecov.io/gh/owner/repo/pull/1",
        summary: "No coverage information found on base report",
      },
    ]);
    expect(classified[0]?.category).toBe("ignored");
    expect(getCiVerdict(classified).anyFailing).toBe(false);
  });

  it("does not ignore a Codecov coverage-target failure", () => {
    const classified = classifyChecks([
      {
        ...baseCheck,
        name: "codecov/patch",
        conclusion: "FAILURE",
        detailsUrl: "https://app.codecov.io/a/b",
        summary: "67.68% of diff hit (target 85.00%)",
      },
    ]);
    expect(classified[0]?.category).toBe("failing");
    expect(getCiVerdict(classified).anyFailing).toBe(true);
  });

  it("does not ignore a GitHub Actions benchmark job that is not CodSpeed", () => {
    const classified = classifyChecks([
      {
        ...baseCheck,
        name: "Benchmark (CPU check)",
        conclusion: "FAILURE",
        workflowName: "Test CI",
      },
    ]);
    expect(classified[0]?.category).toBe("failing");
  });

  it("still keeps a built-in-ignored Actions check visible when neverCancelRuns matches", () => {
    mockLoadConfig.mockReturnValue({
      ...config(),
      actions: { neverCancelRuns: ["CodSpeed"] },
    });
    const classified = classifyChecks([
      {
        ...baseCheck,
        name: "CodSpeed Performance Analysis",
        conclusion: "FAILURE",
        runId: "run-codspeed",
        workflowName: "CodSpeed",
      },
    ]);
    expect(classified[0]?.category).toBe("failing");
    expect(getCiVerdict(classified).ignoredNames).toEqual([]);
  });
});
