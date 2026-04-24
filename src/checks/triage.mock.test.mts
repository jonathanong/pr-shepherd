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
  it("returns timeout for TIMED_OUT conclusion; skips fetch", async () => {
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "TIMED_OUT" })], REPO);
    expect(result!.failureKind).toBe("timeout");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("triageFailingChecks — cancelled", () => {
  it("returns cancelled for CANCELLED conclusion; skips fetch", async () => {
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "CANCELLED" })], REPO);
    expect(result!.failureKind).toBe("cancelled");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns cancelled for STARTUP_FAILURE conclusion; skips fetch", async () => {
    const [result] = await triageFailingChecks(
      [makeCheck({ conclusion: "STARTUP_FAILURE" })],
      REPO,
    );
    expect(result!.failureKind).toBe("cancelled");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns cancelled for STALE conclusion; skips fetch", async () => {
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "STALE" })], REPO);
    expect(result!.failureKind).toBe("cancelled");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not set failedStep for cancelled checks", async () => {
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "CANCELLED" })], REPO);
    expect(result!.failedStep).toBeUndefined();
  });
});

describe("triageFailingChecks — actionable: failedStep", () => {
  it("returns actionable and extracts failedStep from matching job", async () => {
    mockFetch.mockResolvedValueOnce(
      makeJobsResponse([
        {
          id: 42,
          name: "tests",
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
    // CANCELLED → no fetch; mock for run-2 won't be called
    expect(results[1]!.failureKind).toBe("cancelled");
    expect(results[1]!.failedStep).toBeUndefined();
  });
});
