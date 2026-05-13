// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerHooks,
  REPO,
  makeCheck,
  makeJobsResponse,
  mockFetch,
  triageFailingChecks,
} from "./triage.test-support.mts";
import type { ClassifiedCheck } from "./triage.test-support.mts";

registerHooks();

describe("triageFailingChecks — batch", () => {
  it("CANCELLED check skips jobs fetch; FAILURE check fetches jobs", async () => {
    mockFetch.mockResolvedValueOnce(
      makeJobsResponse([
        {
          name: "tests",
          conclusion: "failure",
          steps: [{ name: "Run tests", number: 1, conclusion: "failure" }],
        },
      ]),
    );

    const checks: ClassifiedCheck[] = [
      makeCheck({ name: "tests", runId: "run-1", conclusion: "FAILURE" }),
      makeCheck({ name: "build", runId: "run-2", conclusion: "CANCELLED" }),
    ];
    const results = await triageFailingChecks(checks, REPO);
    expect(results).toHaveLength(2);
    expect(results[0]!.failedStep).toBe("Run tests");
    expect(results[1]!.failedStep).toBeUndefined();
    // Only one jobs fetch — for the FAILURE check; the CANCELLED check short-circuits
    const jobsFetchCalls = (mockFetch.mock.calls as Array<[string]>).filter(([url]) =>
      url.includes("/jobs?filter=latest"),
    );
    expect(jobsFetchCalls).toHaveLength(1);
  });

  it("fetches jobs once per runId when multiple checks share the same run", async () => {
    mockFetch.mockResolvedValueOnce(
      makeJobsResponse([
        {
          name: "tests",
          workflow_name: "CI",
          conclusion: "failure",
          steps: [{ name: "Run tests", number: 1, conclusion: "failure" }],
        },
        {
          name: "lint",
          workflow_name: "CI",
          conclusion: "failure",
          steps: [{ name: "Run lint", number: 1, conclusion: "failure" }],
        },
      ]),
    );

    const checks: ClassifiedCheck[] = [
      makeCheck({ name: "tests", runId: "run-1", conclusion: "FAILURE" }),
      makeCheck({ name: "lint", runId: "run-1", conclusion: "FAILURE" }),
    ];
    const results = await triageFailingChecks(checks, REPO);
    expect(results).toHaveLength(2);
    expect(results[0]!.failedStep).toBe("Run tests");
    expect(results[0]!.workflowName).toBe("CI");
    expect(results[1]!.failedStep).toBe("Run lint");
    expect(results[1]!.workflowName).toBe("CI");
    // Jobs API called once (runId cached)
    const jobsFetchCalls = (mockFetch.mock.calls as Array<[string]>).filter(([url]) =>
      url.includes("/jobs?filter=latest"),
    );
    expect(jobsFetchCalls).toHaveLength(1);
  });
});
