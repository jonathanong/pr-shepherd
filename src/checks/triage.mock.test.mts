import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Stub fetch globally so http.mts uses our mock.
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { triageFailingChecks, extractErrorLines } from "./triage.mts";
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

function makeJobsResponse(jobs: Array<{ id: number; name: string; conclusion: string }>): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve({ jobs }),
    text: () => Promise.resolve(JSON.stringify({ jobs })),
  } as unknown as Response;
}

function makeLogsResponse(text: string): Response {
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

function setupFetch(logs: string, conclusion = "failure"): void {
  // First call: list jobs
  mockFetch.mockResolvedValueOnce(makeJobsResponse([{ id: 42, name: "test-job", conclusion }]));
  // Second call: fetch logs for that job
  mockFetch.mockResolvedValueOnce(makeLogsResponse(logs));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockFetch.mockReset();
  // Provide a token so auth doesn't shell out to `gh auth token`
  process.env["GH_TOKEN"] = "test-token";
});

describe("triageFailingChecks — no runId", () => {
  it("skips log fetch and returns actionable when runId is null", async () => {
    const check = makeCheck({ runId: null });
    const [result] = await triageFailingChecks([check], REPO);
    expect(result!.failureKind).toBe("actionable");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("triageFailingChecks — TIMED_OUT", () => {
  it("returns timeout for TIMED_OUT conclusion regardless of logs", async () => {
    setupFetch("test output: all good\n");
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "TIMED_OUT" })], REPO);
    expect(result!.failureKind).toBe("timeout");
  });

  it('returns timeout when logs contain "exceeded the maximum execution time"', async () => {
    setupFetch("Run exceeded the maximum execution time\n");
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "FAILURE" })], REPO);
    expect(result!.failureKind).toBe("timeout");
  });

  it('returns timeout when logs contain "cancel timeout"', async () => {
    setupFetch("cancel timeout after 6 hours\n");
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "FAILURE" })], REPO);
    expect(result!.failureKind).toBe("timeout");
  });

  it('returns timeout when logs contain "job was cancelled"', async () => {
    setupFetch("Job was cancelled due to timeout\n", "cancelled");
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "CANCELLED" })], REPO);
    expect(result!.failureKind).toBe("timeout");
  });
});

describe("triageFailingChecks — infrastructure", () => {
  it("returns infrastructure for CANCELLED + runner error logs", async () => {
    setupFetch("Runner error: the runner crashed\n", "cancelled");
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "CANCELLED" })], REPO);
    expect(result!.failureKind).toBe("infrastructure");
  });

  it("returns infrastructure for CANCELLED + ECONNRESET logs", async () => {
    setupFetch("Error: ECONNRESET connection reset\n", "cancelled");
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "CANCELLED" })], REPO);
    expect(result!.failureKind).toBe("infrastructure");
  });

  it('returns infrastructure for CANCELLED + "lost communication with the server"', async () => {
    setupFetch("The runner has lost communication with the server\n", "cancelled");
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "CANCELLED" })], REPO);
    expect(result!.failureKind).toBe("infrastructure");
  });

  it("returns infrastructure when jobs fetch fails (empty logs)", async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(500));
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "FAILURE" })], REPO);
    expect(result!.failureKind).toBe("infrastructure");
  });

  it("returns infrastructure for blank logs even with FAILURE conclusion", async () => {
    setupFetch("   \n  \n  ");
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "FAILURE" })], REPO);
    expect(result!.failureKind).toBe("infrastructure");
  });
});

describe("triageFailingChecks — flaky", () => {
  it('returns flaky when logs contain "flaky"', async () => {
    setupFetch("Test is flaky: TestFooBar failed 1/3 runs\n");
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "FAILURE" })], REPO);
    expect(result!.failureKind).toBe("flaky");
  });

  it('returns flaky when logs contain "race condition"', async () => {
    setupFetch("Detected race condition in TestBar\n");
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "FAILURE" })], REPO);
    expect(result!.failureKind).toBe("flaky");
  });

  it('returns flaky when logs contain "retry"', async () => {
    setupFetch("Attempt 3/3 failed, no retry left\n");
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "FAILURE" })], REPO);
    expect(result!.failureKind).toBe("flaky");
  });
});

describe("triageFailingChecks — actionable", () => {
  it("returns actionable for compile errors", async () => {
    setupFetch("error TS2345: Argument of type 'string' is not assignable\n");
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "FAILURE" })], REPO);
    expect(result!.failureKind).toBe("actionable");
  });

  it("returns actionable for test assertion failures", async () => {
    setupFetch("AssertionError: expected 42 to equal 43\n");
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "FAILURE" })], REPO);
    expect(result!.failureKind).toBe("actionable");
  });

  it("returns actionable for lint violations", async () => {
    setupFetch("no-unused-vars: variable `foo` is defined but never used\n");
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "FAILURE" })], REPO);
    expect(result!.failureKind).toBe("actionable");
  });
});

describe("triageFailingChecks — logExcerpt", () => {
  it("attaches logExcerpt for actionable failures", async () => {
    setupFetch("Error: test failed\n");
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "FAILURE" })], REPO);
    expect(result!.logExcerpt).toBeDefined();
    expect(result!.logExcerpt).toContain("Error: test failed");
  });

  it("truncates logExcerpt to 3000 chars", async () => {
    setupFetch("x".repeat(10_000));
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "FAILURE" })], REPO);
    expect((result!.logExcerpt?.length ?? 0) <= 3000).toBe(true);
  });

  it("strips ANSI escape codes from logs", async () => {
    setupFetch("[31mERROR[0m: something failed\n");
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "FAILURE" })], REPO);
    expect(result!.logExcerpt).not.toContain("");
    expect(result!.logExcerpt).toContain("ERROR: something failed");
  });
});

describe("triageFailingChecks — batch", () => {
  it("triages multiple checks in parallel", async () => {
    // check 1: jobs + logs
    mockFetch
      .mockResolvedValueOnce(makeJobsResponse([{ id: 1, name: "tests", conclusion: "failure" }]))
      .mockResolvedValueOnce(makeLogsResponse("AssertionError: expected 1 to equal 2\n"))
      // check 2: jobs + logs
      .mockResolvedValueOnce(makeJobsResponse([{ id: 2, name: "build", conclusion: "cancelled" }]))
      .mockResolvedValueOnce(makeLogsResponse("Runner error: crashed\n"));

    const checks: ClassifiedCheck[] = [
      makeCheck({ name: "tests", runId: "run-1", conclusion: "FAILURE" }),
      makeCheck({ name: "build", runId: "run-2", conclusion: "CANCELLED" }),
    ];
    const results = await triageFailingChecks(checks, REPO);
    expect(results).toHaveLength(2);
    expect(results[0]!.failureKind).toBe("actionable");
    expect(results[1]!.failureKind).toBe("infrastructure");
  });
});

describe("triageFailingChecks — errorExcerpt", () => {
  it("extracts ##[error]-marked line and strips prefix", async () => {
    setupFetch("some output\n##[error]Error: test failed\n");
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "FAILURE" })], REPO);
    expect(result!.errorExcerpt).toBe("Error: test failed");
  });

  it("strips timestamp + ##[error] prefix from error lines", async () => {
    setupFetch("2026-04-23T09:53:06.123Z ##[error]AssertionError: expected 42 to equal 43\n");
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "FAILURE" })], REPO);
    expect(result!.errorExcerpt).toBe("AssertionError: expected 42 to equal 43");
  });

  it("falls back to last raw log line when no ##[error] markers exist", async () => {
    setupFetch("first line\nsecond line\nlast line"); // no trailing newline so "last line" is last element
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "FAILURE" })], REPO);
    // default errorLines=1 → last non-empty line
    expect(result!.errorExcerpt).toBe("last line");
  });

  it("returns undefined errorExcerpt when runId is null (no logs fetched)", async () => {
    const check = makeCheck({ runId: null });
    const [result] = await triageFailingChecks([check], REPO);
    expect(result!.errorExcerpt).toBeUndefined();
  });

  it("returns undefined errorExcerpt when log fetch returns empty string", async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(500));
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "FAILURE" })], REPO);
    expect(result!.errorExcerpt).toBeUndefined();
  });
});

describe("extractErrorLines", () => {
  it("returns last ##[error]-marked line with prefix stripped (maxLines=1)", () => {
    const logs = [
      "build output line",
      "##[error]Error: first error",
      "more output",
      "##[error]Error: second error",
      "##[error]Error: third error",
    ].join("\n");
    expect(extractErrorLines(logs, 1)).toBe("Error: third error");
  });

  it("returns up to maxLines ##[error] lines when multiple exist", () => {
    const logs = ["##[error]Error: first", "##[error]Error: second", "##[error]Error: third"].join(
      "\n",
    );
    expect(extractErrorLines(logs, 2)).toBe("Error: second\nError: third");
    expect(extractErrorLines(logs, 3)).toBe("Error: first\nError: second\nError: third");
  });

  it("strips ISO timestamp prefix before ##[error]", () => {
    const logs = "2026-04-23T09:53:06.123Z ##[error]Error: timed out waiting";
    expect(extractErrorLines(logs, 1)).toBe("Error: timed out waiting");
  });

  it("falls back to last N raw lines when no ##[error] markers exist", () => {
    const logs = "line one\nline two\nline three\nline four";
    expect(extractErrorLines(logs, 2)).toBe("line three\nline four");
  });

  it("returns empty string for empty input", () => {
    expect(extractErrorLines("", 1)).toBe("");
  });

  it("returns empty string when logs are all whitespace", () => {
    expect(extractErrorLines("   \n  \n  ", 1)).toBe("");
  });
});
