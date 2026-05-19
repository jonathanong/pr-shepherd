import { describe, it, expect } from "vitest";
import {
  registerHooks,
  REPO,
  makeCheck,
  makeJobsResponse,
  mockFetch,
  triageFailingChecks,
} from "./triage.test-support.mts";

registerHooks();

describe("triageFailingChecks — job info", () => {
  it("TIMED_OUT: fetches jobs, returns workflowName + jobName", async () => {
    mockFetch.mockResolvedValueOnce(
      makeJobsResponse([{ name: "tests", workflow_name: "CI", conclusion: "timed_out" }]),
    );
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "TIMED_OUT" })], REPO);
    expect(result!.workflowName).toBe("CI");
    expect(result!.jobName).toBe("tests");
    expect(mockFetch).toHaveBeenCalled();
  });

  it("STARTUP_FAILURE with runId: skips jobs fetch, returns only base check fields", async () => {
    const [result] = await triageFailingChecks(
      [makeCheck({ conclusion: "STARTUP_FAILURE" })],
      REPO,
    );
    expect(result!.conclusion).toBe("STARTUP_FAILURE");
    expect(result!.workflowName).toBeUndefined();
    expect(result!.jobName).toBeUndefined();
    expect(result!.failedStep).toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("STALE: treated the same as any other non-cancelled conclusion", async () => {
    mockFetch.mockResolvedValueOnce(makeJobsResponse([{ name: "tests", conclusion: "cancelled" }]));
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "STALE" })], REPO);
    expect(result).toBeDefined();
  });
});
