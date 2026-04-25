import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoist mocks BEFORE any imports so modules capture the mocked versions.
// child_process is still used by iterate.mts for `git` calls only.
// GitHub API mutations now go through fetch (http.mts).
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { mockExecFile } = vi.hoisted(() => ({ mockExecFile: vi.fn() }));

vi.mock("node:child_process", () => ({
  execFile: (
    cmd: string,
    args: string[],
    optsOrCb:
      | Record<string, unknown>
      | ((err: Error | null, result: { stdout: string; stderr: string }) => void),
    maybeCb?: (err: Error | null, result: { stdout: string; stderr: string }) => void,
  ) => {
    const cb = typeof optsOrCb === "function" ? optsOrCb : maybeCb!;
    mockExecFile(cmd, args)
      .then((result: { stdout: string; stderr: string }) => cb(null, result))
      .catch((err: Error & { stderr?: string }) =>
        cb(err, { stdout: "", stderr: err.stderr ?? "" }),
      );
  },
}));

vi.mock("./check.mts", () => ({
  runCheck: vi.fn(),
}));

vi.mock("./ready-delay.mts", () => ({
  updateReadyDelay: vi.fn(),
}));

vi.mock("../github/client.mts", () => ({
  getCurrentPrNumber: vi.fn().mockResolvedValue(42),
}));

vi.mock("../state/fix-attempts.mts", () => ({
  readFixAttempts: vi.fn().mockResolvedValue(null),
  writeFixAttempts: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../state/iterate-stall.mts", () => ({
  readStallState: vi.fn().mockResolvedValue(null),
  writeStallState: vi.fn().mockResolvedValue(undefined),
}));

const { mockLoadConfig } = vi.hoisted(() => ({ mockLoadConfig: vi.fn() }));
vi.mock("../config/load.mts", () => ({ loadConfig: mockLoadConfig }));

import { runIterate } from "./iterate.mts";
import { runCheck } from "./check.mts";
import { updateReadyDelay } from "./ready-delay.mts";
import { readFixAttempts, writeFixAttempts } from "../state/fix-attempts.mts";
import { readStallState, writeStallState } from "../state/iterate-stall.mts";
import type { ShepherdReport, IterateCommandOptions } from "../types.mts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockRunCheck = vi.mocked(runCheck);
const mockUpdateReadyDelay = vi.mocked(updateReadyDelay);
const mockReadFixAttempts = vi.mocked(readFixAttempts);
const mockWriteFixAttempts = vi.mocked(writeFixAttempts);
const mockReadStallState = vi.mocked(readStallState);
const mockWriteStallState = vi.mocked(writeStallState);

function makeReport(overrides: Partial<ShepherdReport> = {}): ShepherdReport {
  return {
    pr: 42,
    nodeId: "PR_kgDOAAA",
    repo: "owner/repo",
    status: "READY",
    baseBranch: "main",
    mergeStatus: {
      status: "CLEAN",
      state: "OPEN" as const,
      isDraft: false,
      mergeable: "MERGEABLE",
      reviewDecision: "APPROVED",
      copilotReviewInProgress: false,
      mergeStateStatus: "CLEAN",
    },
    checks: {
      passing: [
        {
          name: "ci",
          status: "COMPLETED",
          conclusion: "SUCCESS",
          detailsUrl: "https://github.com/owner/repo/actions/runs/1",
          event: "pull_request",
          runId: "run-1",
          category: "passed",
        },
      ],
      failing: [],
      inProgress: [],
      skipped: [],
      filtered: [],
      filteredNames: [],
      blockedByFilteredCheck: false,
    },
    threads: { actionable: [], autoResolved: [], autoResolveErrors: [] },
    comments: { actionable: [] },
    changesRequestedReviews: [],
    reviewSummaries: [],
    approvedReviews: [],
    ...overrides,
  };
}

function makeOpts(overrides: Partial<IterateCommandOptions> = {}): IterateCommandOptions {
  return {
    prNumber: 42,
    format: "json",
    cooldownSeconds: 30,
    readyDelaySeconds: 600,
    ...overrides,
  };
}

const NOW = 1_700_000_000;
const READY_STATE_DEFAULT = {
  isReady: true,
  shouldCancel: false,
  remainingSeconds: 300,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function defaultConfig() {
  return {
    iterate: {
      cooldownSeconds: 30,
      fixAttemptsPerThread: 3,
      stallTimeoutMinutes: 30,
      minimizeApprovals: false,
    },
    watch: { interval: "4m", readyDelayMinutes: 10, expiresHours: 8, maxTurns: 50 },
    resolve: {
      concurrency: 4,
      shaPoll: { intervalMs: 2000, maxAttempts: 10 },
      fetchReviewSummaries: true,
    },
    checks: {
      ciTriggerEvents: ["pull_request", "pull_request_target"],
    },
    mergeStatus: { blockingReviewerLogins: ["copilot"] },
    actions: {
      autoResolveOutdated: true,
      autoMarkReady: true,
      commitSuggestions: true,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadConfig.mockReturnValue(defaultConfig());
  process.env["GH_TOKEN"] = "test-token";
  // Default: last commit was 60s ago (outside cooldown)
  mockExecFile.mockImplementation((cmd: string, args: string[]) => {
    if (cmd === "git" && args[0] === "log") {
      return Promise.resolve({ stdout: String(NOW - 60), stderr: "" });
    }
    if (cmd === "git" && args[0] === "rev-parse") {
      return Promise.resolve({ stdout: "abc123", stderr: "" });
    }
    return Promise.resolve({ stdout: "", stderr: "" });
  });
  // Default: all fetch calls succeed (mutations return 2xx with no body)
  mockFetch.mockResolvedValue({
    ok: true,
    status: 204,
    headers: new Headers(),
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(""),
  });
  vi.useFakeTimers();
  vi.setSystemTime(NOW * 1000);
  mockUpdateReadyDelay.mockResolvedValue(READY_STATE_DEFAULT);
  mockReadFixAttempts.mockResolvedValue(null);
  mockWriteFixAttempts.mockResolvedValue(undefined);
  mockReadStallState.mockResolvedValue(null);
  mockWriteStallState.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("runIterate — rerun_ci", () => {
  it("calls gh run rerun for 2 timeout failures and returns action: rerun_ci", async () => {
    const timeoutCheck1 = {
      name: "test-1",
      status: "COMPLETED" as const,
      conclusion: "TIMED_OUT" as const,
      detailsUrl: "https://github.com/owner/repo/actions/runs/10",
      event: "pull_request",
      runId: "run-10",
      category: "failing" as const,
      failureKind: "timeout" as const,
    };
    const timeoutCheck2 = {
      name: "test-2",
      status: "COMPLETED" as const,
      conclusion: "TIMED_OUT" as const,
      detailsUrl: "https://github.com/owner/repo/actions/runs/11",
      event: "pull_request",
      runId: "run-11",
      category: "failing" as const,
      failureKind: "timeout" as const,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: [],
          failing: [timeoutCheck1, timeoutCheck2],
          inProgress: [],
          skipped: [],
          filtered: [],
          filteredNames: [],
          blockedByFilteredCheck: false,
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("rerun_ci");
    if (result.action === "rerun_ci") {
      expect(result.reran.map((r) => r.runId)).toContain("run-10");
      expect(result.reran.map((r) => r.runId)).toContain("run-11");
      expect(result.reran.find((r) => r.runId === "run-10")?.checkNames).toEqual(["test-1"]);
      expect(result.reran.find((r) => r.runId === "run-11")?.checkNames).toEqual(["test-2"]);
      expect(result.reran.find((r) => r.runId === "run-10")?.failureKind).toBe("timeout");
    }

    // CLI no longer calls rerun-failed-jobs — the agent does it via `gh run rerun`.
    const fetchUrls = (mockFetch.mock.calls as Array<[string, RequestInit]>).map(([url]) => url);
    expect(fetchUrls.some((u) => u.includes("rerun-failed-jobs"))).toBe(false);
  });

  it("deduplicates runIds when multiple failing steps share the same run", async () => {
    const check1 = {
      name: "test-step-1",
      status: "COMPLETED" as const,
      conclusion: "FAILURE" as const,
      detailsUrl: "https://github.com/owner/repo/actions/runs/20",
      event: "pull_request",
      runId: "run-20",
      category: "failing" as const,
      failureKind: "cancelled" as const,
    };
    const check2 = {
      name: "test-step-2",
      status: "COMPLETED" as const,
      conclusion: "FAILURE" as const,
      detailsUrl: "https://github.com/owner/repo/actions/runs/20",
      event: "pull_request",
      runId: "run-20", // same runId
      category: "failing" as const,
      failureKind: "cancelled" as const,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: [],
          failing: [check1, check2],
          inProgress: [],
          skipped: [],
          filtered: [],
          filteredNames: [],
          blockedByFilteredCheck: false,
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("rerun_ci");
    if (result.action === "rerun_ci") {
      expect(result.reran).toHaveLength(1);
      expect(result.reran[0].runId).toBe("run-20");
      expect(result.reran[0].checkNames).toEqual(["test-step-1", "test-step-2"]);
      expect(result.reran[0].failureKind).toBe("cancelled");
    }
  });
});

describe("runIterate — cancelled + BEHIND", () => {
  it("returns rerun_ci (not rebase) for cancelled failure when branch is BEHIND", async () => {
    const cancelledCheck = {
      name: "ci",
      status: "COMPLETED" as const,
      conclusion: "CANCELLED" as const,
      detailsUrl: "https://github.com/owner/repo/actions/runs/30",
      event: "pull_request",
      runId: "run-30",
      category: "failing" as const,
      failureKind: "cancelled" as const,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        mergeStatus: {
          status: "BEHIND",
          state: "OPEN" as const,
          isDraft: false,
          mergeable: "MERGEABLE",
          reviewDecision: null,
          copilotReviewInProgress: false,
          mergeStateStatus: "BEHIND",
        },
        checks: {
          passing: [],
          failing: [cancelledCheck],
          inProgress: [],
          skipped: [],
          filtered: [],
          filteredNames: [],
          blockedByFilteredCheck: false,
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("rerun_ci");
    expect(result.mergeStateStatus).toBe("BEHIND");
  });
});
