import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockLoadConfig } = vi.hoisted(() => ({ mockLoadConfig: vi.fn() }));
vi.mock("../config/load.mts", () => ({ loadConfig: mockLoadConfig }));

import { classifyChecks, getCiVerdict } from "./classify.mts";
import type { CheckRun } from "../types.mts";

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

function config(ignoreChecks: string[] = []) {
  return { ignoreChecks, checks: { ciTriggerEvents: ["pull_request", "pull_request_target"] } };
}

beforeEach(() => {
  mockLoadConfig.mockReturnValue(config());
});

describe("classifyChecks — ignoreChecks", () => {
  it("drops an exact ignored check name before classification", () => {
    mockLoadConfig.mockReturnValue(config(["Kilo Code Review"]));
    const classified = classifyChecks([
      makeCheck({ name: "Kilo Code Review", conclusion: "FAILURE" }),
      makeCheck({ name: "tests", conclusion: "SUCCESS" }),
    ]);
    expect(classified.map((c) => c.name)).toEqual(["tests"]);
  });

  it("matches ignoreChecks as case-insensitive globs", () => {
    mockLoadConfig.mockReturnValue(config(["kilo*"]));
    const classified = classifyChecks([
      makeCheck({ name: "Kilo Code Review", conclusion: "FAILURE" }),
      makeCheck({ name: "tests", conclusion: "SUCCESS" }),
    ]);
    expect(classified.map((c) => c.name)).toEqual(["tests"]);
  });

  it("keeps ignored checks out of the verdict", () => {
    mockLoadConfig.mockReturnValue(config(["Kilo*"]));
    const classified = classifyChecks([
      makeCheck({ name: "Kilo Code Review", conclusion: "FAILURE" }),
      makeCheck({ name: "tests", conclusion: "SUCCESS" }),
    ]);
    const verdict = getCiVerdict(classified);
    expect(verdict.allPassed).toBe(true);
    expect(verdict.anyFailing).toBe(false);
    expect(verdict.anyInProgress).toBe(false);
  });
});
