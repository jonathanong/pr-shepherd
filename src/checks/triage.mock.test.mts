import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Stub fetch globally so http.mts uses our mock.
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { triageFailingChecks } from "./triage.mts";
import type { ClassifiedCheck } from "../types.mts";

const REPO = { owner: "owner", name: "repo" };
const LOG_TAIL_LINES = 10;

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
  id: number;
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

function makeLogsRedirectResponse(logUrl: string): Response {
  return {
    ok: false,
    status: 302,
    headers: new Headers({ location: logUrl }),
  } as unknown as Response;
}

function makeLogTextResponse(text: string): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    text: () => Promise.resolve(text),
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
    const [result] = await triageFailingChecks([check], REPO, LOG_TAIL_LINES);
    expect(result!.workflowName).toBeUndefined();
    expect(result!.jobName).toBeUndefined();
    expect(result!.failedStep).toBeUndefined();
    expect(result!.logTail).toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("TIMED_OUT with runId=null — no fetch, no job info", async () => {
    const check = makeCheck({ runId: null, conclusion: "TIMED_OUT" });
    const [result] = await triageFailingChecks([check], REPO, LOG_TAIL_LINES);
    expect(result!.workflowName).toBeUndefined();
    expect(result!.logTail).toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("triageFailingChecks — job info", () => {
  it("TIMED_OUT: fetches jobs, returns workflowName + jobName; fetches logs", async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeJobsResponse([{ id: 1, name: "tests", workflow_name: "CI", conclusion: "timed_out" }]),
      )
      .mockResolvedValueOnce(makeLogsRedirectResponse("https://s3.example.com/logs"))
      .mockResolvedValueOnce(makeLogTextResponse("line1\nline2\nline3"));
    const [result] = await triageFailingChecks(
      [makeCheck({ conclusion: "TIMED_OUT" })],
      REPO,
      LOG_TAIL_LINES,
    );
    expect(result!.workflowName).toBe("CI");
    expect(result!.jobName).toBe("tests");
    expect(result!.logTail).toBe("line1\nline2\nline3");
    expect(mockFetch).toHaveBeenCalled();
  });

  it("CANCELLED: fetches jobs, returns workflowName + failedStep for the cancelled step", async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeJobsResponse([
          {
            id: 1,
            name: "tests",
            workflow_name: "CI",
            conclusion: "cancelled",
            steps: [{ name: "Run tests", number: 1, conclusion: "cancelled" }],
          },
        ]),
      )
      .mockResolvedValueOnce(makeErrorResponse(404));
    const [result] = await triageFailingChecks(
      [makeCheck({ conclusion: "CANCELLED" })],
      REPO,
      LOG_TAIL_LINES,
    );
    expect(result!.workflowName).toBe("CI");
    expect(result!.failedStep).toBe("Run tests");
  });

  it("STARTUP_FAILURE: treated the same as any other conclusion", async () => {
    mockFetch
      .mockResolvedValueOnce(makeJobsResponse([{ id: 1, name: "tests", conclusion: "cancelled" }]))
      .mockResolvedValueOnce(makeErrorResponse(404));
    const [result] = await triageFailingChecks(
      [makeCheck({ conclusion: "STARTUP_FAILURE" })],
      REPO,
      LOG_TAIL_LINES,
    );
    expect(result!.workflowName).toBeUndefined();
  });

  it("STALE: treated the same as any other conclusion", async () => {
    mockFetch
      .mockResolvedValueOnce(makeJobsResponse([{ id: 1, name: "tests", conclusion: "cancelled" }]))
      .mockResolvedValueOnce(makeErrorResponse(404));
    const [result] = await triageFailingChecks(
      [makeCheck({ conclusion: "STALE" })],
      REPO,
      LOG_TAIL_LINES,
    );
    expect(result).toBeDefined();
  });
});

describe("triageFailingChecks — failedStep", () => {
  it("extracts failedStep + workflowName + jobName from matching job", async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeJobsResponse([
          {
            id: 42,
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
      )
      .mockResolvedValueOnce(makeLogsRedirectResponse("https://s3.example.com/logs"))
      .mockResolvedValueOnce(makeLogTextResponse("test failure output"));
    const [result] = await triageFailingChecks([makeCheck()], REPO, LOG_TAIL_LINES);
    expect(result!.workflowName).toBe("CI");
    expect(result!.jobName).toBe("tests");
    expect(result!.failedStep).toBe("Run tests");
    expect(result!.logTail).toBe("test failure output");
  });

  it("failedStep=undefined when job has no failed steps", async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeJobsResponse([{ id: 42, name: "tests", conclusion: "failure", steps: [] }]),
      )
      .mockResolvedValueOnce(makeErrorResponse(404));
    const [result] = await triageFailingChecks([makeCheck()], REPO, LOG_TAIL_LINES);
    expect(result!.failedStep).toBeUndefined();
  });

  it("failedStep=undefined when no job matches check name", async () => {
    mockFetch.mockResolvedValueOnce(
      makeJobsResponse([
        {
          id: 42,
          name: "some-other-job",
          conclusion: "failure",
          steps: [{ name: "Run tests", number: 1, conclusion: "failure" }],
        },
      ]),
    );
    const [result] = await triageFailingChecks(
      [makeCheck({ name: "tests" })],
      REPO,
      LOG_TAIL_LINES,
    );
    expect(result!.failedStep).toBeUndefined();
    expect(result!.logTail).toBeUndefined();
  });

  it("prefers failing job when multiple jobs share the same check name (matrix)", async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeJobsResponse([
          {
            id: 1,
            name: "tests",
            conclusion: "success",
            steps: [{ name: "Run tests", number: 1, conclusion: "success" }],
          },
          {
            id: 2,
            name: "tests",
            conclusion: "failure",
            steps: [{ name: "Run tests", number: 1, conclusion: "failure" }],
          },
        ]),
      )
      .mockResolvedValueOnce(makeLogsRedirectResponse("https://s3.example.com/logs"))
      .mockResolvedValueOnce(makeLogTextResponse("test output"));
    const [result] = await triageFailingChecks(
      [makeCheck({ name: "tests" })],
      REPO,
      LOG_TAIL_LINES,
    );
    expect(result!.failedStep).toBe("Run tests");
  });

  it("falls back to matchedJobs[0] when no job has a non-success conclusion", async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeJobsResponse([
          {
            id: 7,
            name: "tests",
            conclusion: null as unknown as string,
            steps: [],
          },
        ]),
      )
      .mockResolvedValueOnce(makeErrorResponse(404));
    const [result] = await triageFailingChecks([makeCheck()], REPO, LOG_TAIL_LINES);
    expect(result!.jobName).toBe("tests");
    expect(result!.failedStep).toBeUndefined();
  });

  it("falls back to prefix match for matrix jobs when no exact name match", async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeJobsResponse([
          {
            id: 1,
            name: "build (ubuntu)",
            conclusion: "failure",
            steps: [{ name: "Compile", number: 1, conclusion: "failure" }],
          },
          {
            id: 2,
            name: "build (windows)",
            conclusion: "success",
            steps: [{ name: "Compile", number: 1, conclusion: "success" }],
          },
        ]),
      )
      .mockResolvedValueOnce(makeLogsRedirectResponse("https://s3.example.com/logs"))
      .mockResolvedValueOnce(makeLogTextResponse("compile output"));
    const [result] = await triageFailingChecks(
      [makeCheck({ name: "build" })],
      REPO,
      LOG_TAIL_LINES,
    );
    expect(result!.failedStep).toBe("Compile");
  });

  it("no job info when jobs fetch throws", async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(500));
    const [result] = await triageFailingChecks(
      [makeCheck({ conclusion: "FAILURE" })],
      REPO,
      LOG_TAIL_LINES,
    );
    expect(result!.failedStep).toBeUndefined();
    expect(result!.logTail).toBeUndefined();
  });
});

describe("triageFailingChecks — failedStep non-success conclusions", () => {
  it("captures timed_out step as failedStep", async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeJobsResponse([
          {
            id: 1,
            name: "tests",
            conclusion: "timed_out",
            steps: [
              { name: "Set up job", number: 1, conclusion: "success" },
              { name: "Run tests", number: 2, conclusion: "timed_out" },
            ],
          },
        ]),
      )
      .mockResolvedValueOnce(makeErrorResponse(404));
    const [result] = await triageFailingChecks(
      [makeCheck({ conclusion: "TIMED_OUT" })],
      REPO,
      LOG_TAIL_LINES,
    );
    expect(result!.failedStep).toBe("Run tests");
  });

  it("skips skipped/neutral steps, captures the first genuinely failed step", async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeJobsResponse([
          {
            id: 1,
            name: "tests",
            conclusion: "failure",
            steps: [
              { name: "Check cache", number: 1, conclusion: "skipped" },
              { name: "Run lint", number: 2, conclusion: "neutral" },
              { name: "Run tests", number: 3, conclusion: "failure" },
            ],
          },
        ]),
      )
      .mockResolvedValueOnce(makeErrorResponse(404));
    const [result] = await triageFailingChecks([makeCheck()], REPO, LOG_TAIL_LINES);
    expect(result!.failedStep).toBe("Run tests");
  });
});

describe("triageFailingChecks — log tail", () => {
  it("tails to logTailLines when log has more lines", async () => {
    const logLines = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
    mockFetch
      .mockResolvedValueOnce(makeJobsResponse([{ id: 1, name: "tests", conclusion: "failure" }]))
      .mockResolvedValueOnce(makeLogsRedirectResponse("https://s3.example.com/logs"))
      .mockResolvedValueOnce(makeLogTextResponse(logLines));
    const [result] = await triageFailingChecks([makeCheck()], REPO, 5);
    expect(result!.logTail).toBe("line 15\nline 16\nline 17\nline 18\nline 19");
  });

  it("returns full log when log has fewer lines than logTailLines", async () => {
    mockFetch
      .mockResolvedValueOnce(makeJobsResponse([{ id: 1, name: "tests", conclusion: "failure" }]))
      .mockResolvedValueOnce(makeLogsRedirectResponse("https://s3.example.com/logs"))
      .mockResolvedValueOnce(makeLogTextResponse("only\nthree\nlines"));
    const [result] = await triageFailingChecks([makeCheck()], REPO, 100);
    expect(result!.logTail).toBe("only\nthree\nlines");
  });

  it("logTail=undefined and no log fetch when logTailLines=0", async () => {
    mockFetch.mockResolvedValueOnce(
      makeJobsResponse([{ id: 1, name: "tests", conclusion: "failure" }]),
    );
    const [result] = await triageFailingChecks([makeCheck()], REPO, 0);
    expect(result!.logTail).toBeUndefined();
    // Only the jobs fetch — no log fetch
    const logFetchCalls = (mockFetch.mock.calls as Array<[string]>).filter(
      ([url]) => !url.includes("/jobs"),
    );
    expect(logFetchCalls).toHaveLength(0);
  });

  it("logTail=undefined when log fetch fails", async () => {
    mockFetch
      .mockResolvedValueOnce(makeJobsResponse([{ id: 1, name: "tests", conclusion: "failure" }]))
      .mockResolvedValueOnce(makeErrorResponse(403));
    const [result] = await triageFailingChecks([makeCheck()], REPO, LOG_TAIL_LINES);
    expect(result!.logTail).toBeUndefined();
  });
});

describe("triageFailingChecks — batch", () => {
  it("triages multiple checks; different runIds each get their own fetch", async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeJobsResponse([
          {
            id: 1,
            name: "tests",
            conclusion: "failure",
            steps: [{ name: "Run tests", number: 1, conclusion: "failure" }],
          },
        ]),
      )
      .mockResolvedValueOnce(makeErrorResponse(404)) // log for job 1 fails
      .mockResolvedValueOnce(
        makeJobsResponse([{ id: 2, name: "build", conclusion: "cancelled", steps: [] }]),
      )
      .mockResolvedValueOnce(makeErrorResponse(404)); // log for job 2 fails

    const checks: ClassifiedCheck[] = [
      makeCheck({ name: "tests", runId: "run-1", conclusion: "FAILURE" }),
      makeCheck({ name: "build", runId: "run-2", conclusion: "CANCELLED" }),
    ];
    const results = await triageFailingChecks(checks, REPO, LOG_TAIL_LINES);
    expect(results).toHaveLength(2);
    expect(results[0]!.failedStep).toBe("Run tests");
    expect(results[1]!.failedStep).toBeUndefined();
  });

  it("fetches jobs once per runId when multiple checks share the same run", async () => {
    // Jobs fetched once (cached), but logs fetched per job (different job IDs).
    mockFetch
      .mockResolvedValueOnce(
        makeJobsResponse([
          {
            id: 1,
            name: "tests",
            workflow_name: "CI",
            conclusion: "failure",
            steps: [{ name: "Run tests", number: 1, conclusion: "failure" }],
          },
          {
            id: 2,
            name: "lint",
            workflow_name: "CI",
            conclusion: "failure",
            steps: [{ name: "Run lint", number: 1, conclusion: "failure" }],
          },
        ]),
      )
      .mockResolvedValueOnce(makeErrorResponse(404)) // log for job 1
      .mockResolvedValueOnce(makeErrorResponse(404)); // log for job 2

    const checks: ClassifiedCheck[] = [
      makeCheck({ name: "tests", runId: "run-1", conclusion: "FAILURE" }),
      makeCheck({ name: "lint", runId: "run-1", conclusion: "FAILURE" }),
    ];
    const results = await triageFailingChecks(checks, REPO, LOG_TAIL_LINES);
    expect(results).toHaveLength(2);
    expect(results[0]!.failedStep).toBe("Run tests");
    expect(results[0]!.workflowName).toBe("CI");
    expect(results[1]!.failedStep).toBe("Run lint");
    expect(results[1]!.workflowName).toBe("CI");
    // Jobs API called once (runId cached), log API called twice (job IDs differ)
    const jobsFetchCalls = (mockFetch.mock.calls as Array<[string]>).filter(([url]) =>
      url.includes("/jobs?filter=latest"),
    );
    expect(jobsFetchCalls).toHaveLength(1);
  });
});
