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
  it("skips fetch and returns actionable when runId is null", async () => {
    const check = makeCheck({ runId: null });
    const [result] = await triageFailingChecks([check], REPO);
    expect(result!.failureKind).toBe("actionable");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns actionable (not timeout) for TIMED_OUT when runId is null — no run to rerun", async () => {
    const check = makeCheck({ runId: null, conclusion: "TIMED_OUT" });
    const [result] = await triageFailingChecks([check], REPO);
    expect(result!.failureKind).toBe("actionable");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("triageFailingChecks — TIMED_OUT", () => {
  it("returns timeout with workflowName; fetches job info", async () => {
    mockFetch.mockResolvedValueOnce(
      makeJobsResponse([{ id: 1, name: "tests", workflow_name: "CI", conclusion: "timed_out" }]),
    );
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "TIMED_OUT" })], REPO);
    expect(result!.failureKind).toBe("timeout");
    expect(result!.workflowName).toBe("CI");
    expect(result!.failedStep).toBeUndefined();
    expect(mockFetch).toHaveBeenCalled();
  });
});

describe("triageFailingChecks — cancelled", () => {
  it("returns cancelled with workflowName for CANCELLED; fetches job info", async () => {
    mockFetch.mockResolvedValueOnce(
      makeJobsResponse([{ id: 1, name: "tests", workflow_name: "CI", conclusion: "cancelled" }]),
    );
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "CANCELLED" })], REPO);
    expect(result!.failureKind).toBe("cancelled");
    expect(result!.workflowName).toBe("CI");
    expect(result!.failedStep).toBeUndefined();
  });

  it("returns cancelled for STARTUP_FAILURE conclusion", async () => {
    mockFetch.mockResolvedValueOnce(
      makeJobsResponse([{ id: 1, name: "tests", conclusion: "cancelled" }]),
    );
    const [result] = await triageFailingChecks(
      [makeCheck({ conclusion: "STARTUP_FAILURE" })],
      REPO,
    );
    expect(result!.failureKind).toBe("cancelled");
  });

  it("returns cancelled for STALE conclusion", async () => {
    mockFetch.mockResolvedValueOnce(
      makeJobsResponse([{ id: 1, name: "tests", conclusion: "cancelled" }]),
    );
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "STALE" })], REPO);
    expect(result!.failureKind).toBe("cancelled");
  });

  it("does not set failedStep for cancelled checks even when fetch succeeds", async () => {
    mockFetch.mockResolvedValueOnce(
      makeJobsResponse([
        {
          id: 1,
          name: "tests",
          conclusion: "cancelled",
          steps: [{ name: "Run tests", number: 1, conclusion: "cancelled" }],
        },
      ]),
    );
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "CANCELLED" })], REPO);
    expect(result!.failedStep).toBeUndefined();
  });
});

describe("triageFailingChecks — actionable: failedStep", () => {
  it("returns actionable and extracts failedStep + workflowName from matching job", async () => {
    mockFetch.mockResolvedValueOnce(
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
    );
    const [result] = await triageFailingChecks([makeCheck()], REPO);
    expect(result!.failureKind).toBe("actionable");
    expect(result!.workflowName).toBe("CI");
    expect(result!.failedStep).toBe("Run tests");
  });

  it("returns actionable with failedStep=undefined when job has no failed steps", async () => {
    mockFetch.mockResolvedValueOnce(
      makeJobsResponse([{ id: 42, name: "tests", conclusion: "failure", steps: [] }]),
    );
    const [result] = await triageFailingChecks([makeCheck()], REPO);
    expect(result!.failureKind).toBe("actionable");
    expect(result!.failedStep).toBeUndefined();
  });

  it("returns actionable with failedStep=undefined when no job matches check name", async () => {
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
    const [result] = await triageFailingChecks([makeCheck({ name: "tests" })], REPO);
    expect(result!.failureKind).toBe("actionable");
    expect(result!.failedStep).toBeUndefined();
  });

  it("prefers failing job when multiple jobs share the same check name (matrix)", async () => {
    mockFetch.mockResolvedValueOnce(
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
    );
    const [result] = await triageFailingChecks([makeCheck({ name: "tests" })], REPO);
    expect(result!.failedStep).toBe("Run tests");
  });

  it("falls back to prefix match for matrix jobs when no exact name match", async () => {
    mockFetch.mockResolvedValueOnce(
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
    );
    const [result] = await triageFailingChecks([makeCheck({ name: "build" })], REPO);
    expect(result!.failedStep).toBe("Compile");
  });

  it("returns actionable with failedStep=undefined when jobs fetch throws", async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(500));
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "FAILURE" })], REPO);
    expect(result!.failureKind).toBe("actionable");
    expect(result!.failedStep).toBeUndefined();
  });

  it("returns actionable with failedStep=undefined when runId is null", async () => {
    const check = makeCheck({ runId: null });
    const [result] = await triageFailingChecks([check], REPO);
    expect(result!.failureKind).toBe("actionable");
    expect(result!.failedStep).toBeUndefined();
  });
});

describe("triageFailingChecks — batch", () => {
  it("triages multiple checks in parallel", async () => {
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
      .mockResolvedValueOnce(
        makeJobsResponse([{ id: 2, name: "build", conclusion: "cancelled", steps: [] }]),
      );

    const checks: ClassifiedCheck[] = [
      makeCheck({ name: "tests", runId: "run-1", conclusion: "FAILURE" }),
      makeCheck({ name: "build", runId: "run-2", conclusion: "CANCELLED" }),
    ];
    const results = await triageFailingChecks(checks, REPO);
    expect(results).toHaveLength(2);
    expect(results[0]!.failureKind).toBe("actionable");
    expect(results[0]!.failedStep).toBe("Run tests");
    // CANCELLED → fetch is called for workflowName; mock for run-2 is consumed
    expect(results[1]!.failureKind).toBe("cancelled");
    expect(results[1]!.failedStep).toBeUndefined();
  });

  it("fetches jobs once per runId when multiple checks share the same run", async () => {
    mockFetch.mockResolvedValueOnce(
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
    // Only one fetch call despite two checks sharing the same runId
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
