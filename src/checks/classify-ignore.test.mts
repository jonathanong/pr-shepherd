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
  return { ignoreChecks, checks: { ciTriggerEvents: ["pull_request", "pull_request_target"] } };
}

beforeEach(() => {
  mockLoadConfig.mockReturnValue(config());
});

describe("classifyChecks — ignoreChecks", () => {
  it("drops case-insensitive glob matches before classification and verdicts", () => {
    mockLoadConfig.mockReturnValue(config(["kilo*"]));
    const classified = classifyChecks([
      { ...baseCheck, name: "Kilo Code Review", conclusion: "FAILURE" },
      baseCheck,
    ]);
    expect(classified.map((c) => c.name)).toEqual(["tests"]);
    const verdict = getCiVerdict(classified);
    expect(verdict.allPassed).toBe(true);
    expect(verdict.anyFailing).toBe(false);
    expect(verdict.anyInProgress).toBe(false);
  });
});
