/* eslint-disable max-lines */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Stub fetch globally so http.mts uses our mock.
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { fetchStartupFailureChecks, triageFailingChecks } from "./triage.mts";
import { mergeStartupFailureChecks } from "./startup-failures.mts";
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

function makeWorkflowRunsResponse(runs: unknown[]): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve({ workflow_runs: runs }),
    text: () => Promise.resolve(JSON.stringify({ workflow_runs: runs })),
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

describe("fetchStartupFailureChecks", () => {
  it("maps startup_failure workflow runs to CheckRun fields", async () => {
    mockFetch.mockResolvedValueOnce(
      makeWorkflowRunsResponse([
        {
          id: 25406234225,
          name: "CI",
          event: "pull_request",
          status: "completed",
          conclusion: "startup_failure",
          html_url: "https://github.com/owner/repo/actions/runs/25406234225",
          display_title: "ci: skip secret-backed jobs for dependency bots",
          pull_requests: [{ number: 42, head: { sha: "abc123" } }],
        },
      ]),
    );

    const checks = await fetchStartupFailureChecks(REPO, "abc123", 42);

    expect(checks).toEqual([
      {
        name: "CI",
        status: "COMPLETED",
        conclusion: "STARTUP_FAILURE",
        detailsUrl: "https://github.com/owner/repo/actions/runs/25406234225",
        event: "pull_request",
        runId: "25406234225",
        summary: "ci: skip secret-backed jobs for dependency bots",
      },
    ]);
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain("/actions/runs");
    expect(url).toContain("head_sha=abc123");
    expect(url).toContain("status=startup_failure");
  });

  it("falls back to workflow run id when the run name is blank", async () => {
    mockFetch.mockResolvedValueOnce(
      makeWorkflowRunsResponse([
        {
          id: 123,
          name: " ",
          event: "pull_request",
          status: "completed",
          conclusion: "startup_failure",
          html_url: "https://github.com/owner/repo/actions/runs/123",
          display_title: "",
          pull_requests: [{ number: 42, head: { sha: "abc123" } }],
        },
      ]),
    );

    const [check] = await fetchStartupFailureChecks(REPO, "abc123", 42);

    expect(check!.name).toBe("workflow run 123");
    expect(check).not.toHaveProperty("summary");
  });

  it("omits summary when GitHub omits display_title", async () => {
    mockFetch.mockResolvedValueOnce(
      makeWorkflowRunsResponse([
        {
          id: 124,
          name: "CI",
          event: "pull_request",
          status: "completed",
          conclusion: "startup_failure",
          html_url: "https://github.com/owner/repo/actions/runs/124",
          pull_requests: [{ number: 42, head: { sha: "abc123" } }],
        },
      ]),
    );

    const [check] = await fetchStartupFailureChecks(REPO, "abc123", 42);

    expect(check!.name).toBe("CI");
    expect(check).not.toHaveProperty("summary");
  });

  it("filters out runs when GitHub omits pull_requests", async () => {
    mockFetch.mockResolvedValueOnce(
      makeWorkflowRunsResponse([
        {
          id: 125,
          name: "CI",
          event: "pull_request",
          status: "completed",
          conclusion: "startup_failure",
          html_url: "https://github.com/owner/repo/actions/runs/125",
        },
      ]),
    );

    await expect(fetchStartupFailureChecks(REPO, "abc123", 42)).resolves.toEqual([]);
  });

  it("filters out startup-failure runs from other PRs sharing the same head SHA", async () => {
    mockFetch.mockResolvedValueOnce(
      makeWorkflowRunsResponse([
        {
          id: 123,
          name: "CI",
          event: "pull_request",
          status: "completed",
          conclusion: "startup_failure",
          html_url: "https://github.com/owner/repo/actions/runs/123",
          pull_requests: [{ number: 41, head: { sha: "abc123" } }],
        },
        {
          id: 456,
          name: "CI",
          event: "pull_request",
          status: "completed",
          conclusion: "startup_failure",
          html_url: "https://github.com/owner/repo/actions/runs/456",
          pull_requests: [{ number: 42, head: { sha: "abc123" } }],
        },
      ]),
    );

    const checks = await fetchStartupFailureChecks(REPO, "abc123", 42);

    expect(checks.map((c) => c.runId)).toEqual(["456"]);
  });

  it("matches startup-failure runs when GitHub omits the PR head SHA", async () => {
    mockFetch.mockResolvedValueOnce(
      makeWorkflowRunsResponse([
        {
          id: 789,
          name: "CI",
          event: "pull_request",
          status: "completed",
          conclusion: "startup_failure",
          html_url: "https://github.com/owner/repo/actions/runs/789",
          pull_requests: [{ number: 42, head: null }],
        },
      ]),
    );

    const checks = await fetchStartupFailureChecks(REPO, "abc123", 42);

    expect(checks.map((c) => c.runId)).toEqual(["789"]);
  });

  it("warns when startup-failure pagination reaches the cap", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      for (let page = 0; page < 10; page++) {
        mockFetch.mockResolvedValueOnce(
          makeWorkflowRunsResponse(
            Array.from({ length: 100 }, (_, i) => ({
              id: page * 100 + i,
              name: "CI",
              event: "pull_request",
              status: "completed",
              conclusion: "startup_failure",
              html_url: `https://github.com/owner/repo/actions/runs/${page * 100 + i}`,
              pull_requests: [{ number: 42, head: { sha: "abc123" } }],
            })),
          ),
        );
      }

      const checks = await fetchStartupFailureChecks(REPO, "abc123", 42);

      expect(checks).toHaveLength(1000);
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining("startup-failure run pagination cap"),
      );
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it("returns an empty supplement when the Actions runs fetch fails", async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(403));
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    try {
      const checks = await fetchStartupFailureChecks(REPO, "abc123", 42);

      expect(checks).toEqual([]);
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining("startup-failure run fetch failed for PR #42 at abc123 (ignored)"),
      );
    } finally {
      stderrSpy.mockRestore();
    }
  });
});

describe("mergeStartupFailureChecks", () => {
  it("replaces duplicate check runs and removes superseded duplicates", () => {
    const original = [
      makeCheck({ name: "old first", runId: "run-1", conclusion: "FAILURE" }),
      makeCheck({ name: "old duplicate", runId: "run-1", conclusion: "FAILURE" }),
      makeCheck({ name: "status context", runId: null, conclusion: "FAILURE" }),
    ];
    const startup = [
      makeCheck({ name: "startup", runId: "run-1", conclusion: "STARTUP_FAILURE" }),
      makeCheck({ name: "new startup", runId: "run-2", conclusion: "STARTUP_FAILURE" }),
    ];

    expect(mergeStartupFailureChecks(original, startup).map((check) => check.name)).toEqual([
      "startup",
      "status context",
      "new startup",
    ]);
  });

  it("appends startup failures that do not have a runId", () => {
    const startup = makeCheck({
      name: "startup without run id",
      runId: null,
      conclusion: "STARTUP_FAILURE",
    });

    expect(mergeStartupFailureChecks([], [startup])).toEqual([startup]);
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

  it("warns and returns accumulated jobs when job pagination reaches the cap", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      for (let page = 0; page < 20; page++) {
        mockFetch.mockResolvedValueOnce(
          makeJobsResponse(
            Array.from({ length: 100 }, (_, i) => ({
              name: page === 0 && i === 0 ? "tests" : `job-${page}-${i}`,
              workflow_name: "CI",
              conclusion: page === 0 && i === 0 ? "failure" : "success",
              steps:
                page === 0 && i === 0
                  ? [{ name: "Run tests", number: 1, conclusion: "failure" }]
                  : [],
            })),
          ),
        );
      }

      const [result] = await triageFailingChecks([makeCheck()], REPO);

      expect(result!.failedStep).toBe("Run tests");
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("job pagination cap"));
    } finally {
      stderrSpy.mockRestore();
    }
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
