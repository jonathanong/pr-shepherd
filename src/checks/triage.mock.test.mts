import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoist mock BEFORE any imports so node:child_process is replaced before
// triage.mts captures a reference to execFile via promisify().
// ---------------------------------------------------------------------------

const { mockExecFile } = vi.hoisted(() => ({ mockExecFile: vi.fn() }));

vi.mock("node:child_process", () => ({
  execFile: (
    _cmd: string,
    _args: string[],
    _opts: Record<string, unknown>,
    cb: (err: Error | null, result: { stdout: string }) => void,
  ) => {
    // Simulate promisify-compatible callback shape.
    mockExecFile(_cmd, _args, _opts)
      .then((result: { stdout: string }) => cb(null, result))
      .catch((err: Error) => cb(err, { stdout: "" }));
  },
}));

import { triageFailingChecks } from "./triage.mts";
import type { ClassifiedCheck } from "../types.mts";

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockExecFile.mockReset();
});

describe("triageFailingChecks — no runId", () => {
  it("skips log fetch and returns actionable when runId is null", async () => {
    const check = makeCheck({ runId: null });
    const [result] = await triageFailingChecks([check]);
    expect(result!.failureKind).toBe("actionable");
    expect(mockExecFile).not.toHaveBeenCalled();
  });
});

describe("triageFailingChecks — TIMED_OUT", () => {
  it("returns timeout for TIMED_OUT conclusion regardless of logs", async () => {
    mockExecFile.mockResolvedValue({ stdout: "test output: all good\n" });
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "TIMED_OUT" })]);
    expect(result!.failureKind).toBe("timeout");
  });

  it('returns timeout when logs contain "exceeded the maximum execution time"', async () => {
    mockExecFile.mockResolvedValue({ stdout: "Run exceeded the maximum execution time\n" });
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "FAILURE" })]);
    expect(result!.failureKind).toBe("timeout");
  });

  it('returns timeout when logs contain "cancel timeout"', async () => {
    mockExecFile.mockResolvedValue({ stdout: "cancel timeout after 6 hours\n" });
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "FAILURE" })]);
    expect(result!.failureKind).toBe("timeout");
  });

  it('returns timeout when logs contain "job was cancelled"', async () => {
    mockExecFile.mockResolvedValue({ stdout: "Job was cancelled due to timeout\n" });
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "CANCELLED" })]);
    expect(result!.failureKind).toBe("timeout");
  });
});

describe("triageFailingChecks — infrastructure", () => {
  it("returns infrastructure for CANCELLED + runner error logs", async () => {
    mockExecFile.mockResolvedValue({ stdout: "Runner error: the runner crashed\n" });
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "CANCELLED" })]);
    expect(result!.failureKind).toBe("infrastructure");
  });

  it("returns infrastructure for CANCELLED + ECONNRESET logs", async () => {
    mockExecFile.mockResolvedValue({ stdout: "Error: ECONNRESET connection reset\n" });
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "CANCELLED" })]);
    expect(result!.failureKind).toBe("infrastructure");
  });

  it('returns infrastructure for CANCELLED + "lost communication with the server"', async () => {
    mockExecFile.mockResolvedValue({
      stdout: "The runner has lost communication with the server\n",
    });
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "CANCELLED" })]);
    expect(result!.failureKind).toBe("infrastructure");
  });

  it("returns infrastructure when gh run view fails (empty logs)", async () => {
    mockExecFile.mockRejectedValue(new Error("exit 1"));
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "FAILURE" })]);
    expect(result!.failureKind).toBe("infrastructure");
  });

  it("returns infrastructure for blank logs even with FAILURE conclusion", async () => {
    mockExecFile.mockResolvedValue({ stdout: "   \n  \n  " });
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "FAILURE" })]);
    expect(result!.failureKind).toBe("infrastructure");
  });
});

describe("triageFailingChecks — flaky", () => {
  it('returns flaky when logs contain "flaky"', async () => {
    mockExecFile.mockResolvedValue({ stdout: "Test is flaky: TestFooBar failed 1/3 runs\n" });
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "FAILURE" })]);
    expect(result!.failureKind).toBe("flaky");
  });

  it('returns flaky when logs contain "race condition"', async () => {
    mockExecFile.mockResolvedValue({ stdout: "Detected race condition in TestBar\n" });
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "FAILURE" })]);
    expect(result!.failureKind).toBe("flaky");
  });

  it('returns flaky when logs contain "retry"', async () => {
    mockExecFile.mockResolvedValue({ stdout: "Attempt 3/3 failed, no retry left\n" });
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "FAILURE" })]);
    expect(result!.failureKind).toBe("flaky");
  });
});

describe("triageFailingChecks — actionable", () => {
  it("returns actionable for compile errors", async () => {
    mockExecFile.mockResolvedValue({
      stdout: "error TS2345: Argument of type 'string' is not assignable\n",
    });
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "FAILURE" })]);
    expect(result!.failureKind).toBe("actionable");
  });

  it("returns actionable for test assertion failures", async () => {
    mockExecFile.mockResolvedValue({ stdout: "AssertionError: expected 42 to equal 43\n" });
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "FAILURE" })]);
    expect(result!.failureKind).toBe("actionable");
  });

  it("returns actionable for lint violations", async () => {
    mockExecFile.mockResolvedValue({
      stdout: "no-unused-vars: variable `foo` is defined but never used\n",
    });
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "FAILURE" })]);
    expect(result!.failureKind).toBe("actionable");
  });
});

describe("triageFailingChecks — logExcerpt", () => {
  it("attaches logExcerpt for actionable failures", async () => {
    mockExecFile.mockResolvedValue({ stdout: "Error: test failed\n" });
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "FAILURE" })]);
    expect(result!.logExcerpt).toBeDefined();
    expect(result!.logExcerpt).toContain("Error: test failed");
  });

  it("truncates logExcerpt to 3000 chars", async () => {
    mockExecFile.mockResolvedValue({ stdout: "x".repeat(10_000) });
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "FAILURE" })]);
    expect((result!.logExcerpt?.length ?? 0) <= 3000).toBe(true);
  });

  it("strips ANSI escape codes from logs", async () => {
    mockExecFile.mockResolvedValue({ stdout: "\u001B[31mERROR\u001B[0m: something failed\n" });
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "FAILURE" })]);
    expect(result!.logExcerpt).not.toContain("\u001B");
    expect(result!.logExcerpt).toContain("ERROR: something failed");
  });
});

describe("triageFailingChecks — batch", () => {
  it("triages multiple checks in parallel", async () => {
    mockExecFile
      .mockResolvedValueOnce({ stdout: "AssertionError: expected 1 to equal 2\n" })
      .mockResolvedValueOnce({ stdout: "Runner error: crashed\n" });

    const checks: ClassifiedCheck[] = [
      makeCheck({ name: "tests", runId: "run-1", conclusion: "FAILURE" }),
      makeCheck({ name: "build", runId: "run-2", conclusion: "CANCELLED" }),
    ];
    const results = await triageFailingChecks(checks);
    expect(results).toHaveLength(2);
    expect(results[0]!.failureKind).toBe("actionable");
    expect(results[1]!.failureKind).toBe("infrastructure");
  });
});
