import { describe, it, expect } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  makeCheck,
  mockFetchPrBatch,
  mockLoadConfig,
  mockTriageFailingChecks,
  defaultConfig,
} from "../../test-helpers/commands/check.test-support.mts";
import { runCheck } from "./check.mts";

registerHooks();

describe("runCheck — skipTriage", () => {
  it("skips triageFailingChecks when skipTriage=true", async () => {
    const failingCheck = makeCheck({ category: "failing", conclusion: "FAILURE" });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ checks: [failingCheck] }),
    });
    await runCheck({ ...BASE_OPTS, skipTriage: true });
    expect(mockTriageFailingChecks).not.toHaveBeenCalled();
  });

  it("calls triageFailingChecks when failing checks exist and skipTriage is absent", async () => {
    const failingCheck = makeCheck({ category: "failing", conclusion: "FAILURE" });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ checks: [failingCheck] }),
    });
    await runCheck(BASE_OPTS);
    expect(mockTriageFailingChecks).toHaveBeenCalledTimes(1);
  });

  it("does not triage checks matched by ignoreChecks", async () => {
    mockLoadConfig.mockReturnValue({ ...defaultConfig(), ignoreChecks: ["kilo*"] });
    const ignoredCheck = makeCheck({ name: "Kilo Code Review", conclusion: "FAILURE" });
    const passingCheck = makeCheck({ name: "tests", conclusion: "SUCCESS" });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ checks: [ignoredCheck, passingCheck] }),
    });
    const report = await runCheck(BASE_OPTS);
    expect(report.checks.failing).toEqual([]);
    expect(report.checks.passing.map((c) => c.name)).toEqual(["tests"]);
    expect(mockTriageFailingChecks).not.toHaveBeenCalled();
  });

  it("treats UNSTABLE with only ignored failures as ready without actionable failing checks", async () => {
    mockLoadConfig.mockReturnValue({
      ...defaultConfig(),
      ignoreChecks: ["Final Code Review / Claude Code Review"],
    });
    const ignoredCheck = makeCheck({
      name: "Final Code Review / Claude Code Review",
      conclusion: "FAILURE",
    });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ mergeStateStatus: "UNSTABLE", checks: [ignoredCheck] }),
    });

    const report = await runCheck(BASE_OPTS);

    expect(report.status).toBe("READY");
    expect(report.checks.failing).toEqual([]);
    expect(report.checks.ignoredNames).toEqual(["Final Code Review / Claude Code Review"]);
    expect(mockTriageFailingChecks).not.toHaveBeenCalled();
  });
});
