import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Stub fetch globally so http.mts uses our mock.
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { triageFailingChecks } from "./triage.mts";
import type { ClassifiedCheck } from "../types.mts";

const REPO = { owner: "owner", name: "repo" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCheck(overrides: Partial<ClassifiedCheck> = {}): ClassifiedCheck {
  return {
    name: "tests",
    status: "COMPLETED",
    conclusion: "FAILURE",
    detailsUrl: "https://github.com/owner/repo/actions/runs/99/jobs/1",
    event: "pull_request",
    runId: "run-99",
    category: "failing",
    ...overrides,
  };
}

type JobStub = {
  name: string;
  workflow_name?: string;
  conclusion: string;
  steps?: Array<{ name: string; number: number; conclusion: string | null }>;
};

function makeJobsResponse(jobs: JobStub[]): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve({ jobs }),
    text: () => Promise.resolve(JSON.stringify({ jobs })),
  } as unknown as Response;
}

function makeErrorResponse(status: number): Response {
  return {
    ok: false,
    status,
    headers: new Headers(),
    text: () => Promise.resolve("error"),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockFetch.mockReset();
  process.env["GH_TOKEN"] = "test-token";
});

describe("triageFailingChecks — no runId", () => {
  it("skips fetch and returns no job info when runId is null", async () => {
    const check = makeCheck({ runId: null });
    const [result] = await triageFailingChecks([check], REPO);
    expect(result!.workflowName).toBeUndefined();
    expect(result!.jobName).toBeUndefined();
    expect(result!.failedStep).toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("TIMED_OUT with runId=null — no fetch, no job info", async () => {
    const check = makeCheck({ runId: null, conclusion: "TIMED_OUT" });
    const [result] = await triageFailingChecks([check], REPO);
    expect(result!.workflowName).toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("triageFailingChecks — CANCELLED short-circuits", () => {
  it("CANCELLED with runId: skips jobs fetch, returns only base check fields", async () => {
    const check = makeCheck({ conclusion: "CANCELLED" });
    const [result] = await triageFailingChecks([check], REPO);
    expect(result!.conclusion).toBe("CANCELLED");
    expect(result!.workflowName).toBeUndefined();
    expect(result!.jobName).toBeUndefined();
    expect(result!.failedStep).toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

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

  it("STARTUP_FAILURE: treated the same as any other non-cancelled conclusion", async () => {
    mockFetch.mockResolvedValueOnce(makeJobsResponse([{ name: "tests", conclusion: "cancelled" }]));
    const [result] = await triageFailingChecks(
      [makeCheck({ conclusion: "STARTUP_FAILURE" })],
      REPO,
    );
    expect(result!.workflowName).toBeUndefined();
  });

  it("STALE: treated the same as any other non-cancelled conclusion", async () => {
    mockFetch.mockResolvedValueOnce(makeJobsResponse([{ name: "tests", conclusion: "cancelled" }]));
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "STALE" })], REPO);
    expect(result).toBeDefined();
  });
});

describe("triageFailingChecks — failedStep", () => {
  it("extracts failedStep + workflowName + jobName from matching job", async () => {
    mockFetch.mockResolvedValueOnce(
      makeJobsResponse([
        {
          name: "tests",
          workflow_name: "CI",
          conclusion: "failure",
          steps: [
            { name: "Set up job", number: 1, conclusion: "success" },
            { name: "Run tests", number: 2, conclusion: "failure" },
            { name: "Post", number: 3, conclusion: null },
          ],
        },
      ]),
    );
    const [result] = await triageFailingChecks([makeCheck()], REPO);
    expect(result!.workflowName).toBe("CI");
    expect(result!.jobName).toBe("tests");
    expect(result!.failedStep).toBe("Run tests");
  });

  it("failedStep=undefined when job has no failed steps", async () => {
    mockFetch.mockResolvedValueOnce(
      makeJobsResponse([{ name: "tests", conclusion: "failure", steps: [] }]),
    );
    const [result] = await triageFailingChecks([makeCheck()], REPO);
    expect(result!.failedStep).toBeUndefined();
  });

  it("failedStep=undefined when no job matches check name", async () => {
    mockFetch.mockResolvedValueOnce(
      makeJobsResponse([
        {
          name: "some-other-job",
          conclusion: "failure",
          steps: [{ name: "Run tests", number: 1, conclusion: "failure" }],
        },
      ]),
    );
    const [result] = await triageFailingChecks([makeCheck({ name: "tests" })], REPO);
    expect(result!.failedStep).toBeUndefined();
  });

  it("prefers failing job when multiple jobs share the same check name (matrix)", async () => {
    mockFetch.mockResolvedValueOnce(
      makeJobsResponse([
        {
          name: "tests",
          conclusion: "success",
          steps: [{ name: "Run tests", number: 1, conclusion: "success" }],
        },
        {
          name: "tests",
          conclusion: "failure",
          steps: [{ name: "Run tests", number: 1, conclusion: "failure" }],
        },
      ]),
    );
    const [result] = await triageFailingChecks([makeCheck({ name: "tests" })], REPO);
    expect(result!.failedStep).toBe("Run tests");
  });

  it("falls back to matchedJobs[0] when no job has a non-success conclusion", async () => {
    mockFetch.mockResolvedValueOnce(
      makeJobsResponse([
        {
          name: "tests",
          conclusion: null as unknown as string,
          steps: [],
        },
      ]),
    );
    const [result] = await triageFailingChecks([makeCheck()], REPO);
    expect(result!.jobName).toBe("tests");
    expect(result!.failedStep).toBeUndefined();
  });

  it("falls back to prefix match for matrix jobs when no exact name match", async () => {
    mockFetch.mockResolvedValueOnce(
      makeJobsResponse([
        {
          name: "build (ubuntu)",
          conclusion: "failure",
          steps: [{ name: "Compile", number: 1, conclusion: "failure" }],
        },
        {
          name: "build (windows)",
          conclusion: "success",
          steps: [{ name: "Compile", number: 1, conclusion: "success" }],
        },
      ]),
    );
    const [result] = await triageFailingChecks([makeCheck({ name: "build" })], REPO);
    expect(result!.failedStep).toBe("Compile");
  });

  it("no job info when jobs fetch throws", async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(500));
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "FAILURE" })], REPO);
    expect(result!.failedStep).toBeUndefined();
  });
});

describe("triageFailingChecks — failedStep non-success conclusions", () => {
  it("captures timed_out step as failedStep", async () => {
    mockFetch.mockResolvedValueOnce(
      makeJobsResponse([
        {
          name: "tests",
          conclusion: "timed_out",
          steps: [
            { name: "Set up job", number: 1, conclusion: "success" },
            { name: "Run tests", number: 2, conclusion: "timed_out" },
          ],
        },
      ]),
    );
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "TIMED_OUT" })], REPO);
    expect(result!.failedStep).toBe("Run tests");
  });

  it("skips skipped/neutral steps, captures the first genuinely failed step", async () => {
    mockFetch.mockResolvedValueOnce(
      makeJobsResponse([
        {
          name: "tests",
          conclusion: "failure",
          steps: [
            { name: "Check cache", number: 1, conclusion: "skipped" },
            { name: "Run lint", number: 2, conclusion: "neutral" },
            { name: "Run tests", number: 3, conclusion: "failure" },
          ],
        },
      ]),
    );
    const [result] = await triageFailingChecks([makeCheck()], REPO);
    expect(result!.failedStep).toBe("Run tests");
  });
});

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
