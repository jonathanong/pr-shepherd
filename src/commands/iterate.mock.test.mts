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
      .catch((err: Error) => cb(err, { stdout: "", stderr: "" }));
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
    threads: {
      actionable: [],
      resolutionOnly: [],
      autoResolved: [],
      autoResolveErrors: [],
      firstLook: [],
    },
    comments: { actionable: [], firstLook: [] },
    changesRequestedReviews: [],
    reviewSummaries: [],
    firstLookSummaries: [],
    editedSummaries: [],
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
    watch: { interval: "4m", readyDelayMinutes: 10 },
    resolve: {
      concurrency: 4,
      shaPoll: { intervalMs: 2000, maxAttempts: 10 },
      fetchReviewSummaries: true,
    },
    checks: {
      ciTriggerEvents: ["pull_request", "pull_request_target"],
      timeoutPatterns: [],
      infraPatterns: [],
      logMaxLines: 50,
      logMaxChars: 3000,
      errorLines: 1,
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

describe("runIterate — cooldown", () => {
  it("returns action: cooldown when last commit is 5s ago", async () => {
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "log") {
        return Promise.resolve({ stdout: String(NOW - 5), stderr: "" });
      }
      return Promise.resolve({ stdout: "", stderr: "" });
    });

    const result = await runIterate(makeOpts({ cooldownSeconds: 30 }));

    expect(result.action).toBe("cooldown");
    expect(mockRunCheck).not.toHaveBeenCalled();
  });

  it("skips cooldown and proceeds when git log fails (null lastCommitTime)", async () => {
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "log") return Promise.reject(new Error("not a git repo"));
      if (cmd === "git" && args[0] === "rev-parse")
        return Promise.resolve({ stdout: "abc\n", stderr: "" });
      return Promise.resolve({ stdout: "", stderr: "" });
    });
    mockRunCheck.mockResolvedValue(makeReport());
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: false,
      remainingSeconds: 300,
    });

    const result = await runIterate(makeOpts({ cooldownSeconds: 30, noAutoMarkReady: true }));

    expect(result.action).not.toBe("cooldown");
    expect(mockRunCheck).toHaveBeenCalled();
  });
});

describe("runIterate — wait", () => {
  it("returns action: wait when all CI is passing and no threads", async () => {
    mockRunCheck.mockResolvedValue(makeReport());
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: false,
      remainingSeconds: 300,
    });

    const result = await runIterate(makeOpts({ noAutoMarkReady: true }));

    expect(result.action).toBe("wait");
    expect(result.pr).toBe(42);
    expect(result.status).toBe("READY");
    expect(result.summary.passing).toBe(1);
  });
});

describe("runIterate — cancel", () => {
  it("returns action: cancel when shouldCancel is true", async () => {
    mockRunCheck.mockResolvedValue(makeReport());
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("cancel");
    expect(result.shouldCancel).toBe(true);
    expect(result.remainingSeconds).toBe(0);
  });
});

describe("runIterate — cancel on merged/closed PR", () => {
  it("returns action: cancel and does not call updateReadyDelay when PR is MERGED", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        mergeStatus: {
          status: "UNKNOWN",
          state: "MERGED",
          isDraft: false,
          mergeable: "UNKNOWN",
          reviewDecision: null,
          copilotReviewInProgress: false,
          mergeStateStatus: "UNKNOWN",
        },
      }),
    );

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("cancel");
    expect(result.state).toBe("MERGED");
    expect(mockUpdateReadyDelay).not.toHaveBeenCalled();
  });

  it("returns action: cancel when PR is CLOSED", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        mergeStatus: {
          status: "UNKNOWN",
          state: "CLOSED",
          isDraft: false,
          mergeable: "UNKNOWN",
          reviewDecision: null,
          copilotReviewInProgress: false,
          mergeStateStatus: "UNKNOWN",
        },
      }),
    );

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("cancel");
    expect(result.state).toBe("CLOSED");
    expect(mockUpdateReadyDelay).not.toHaveBeenCalled();
  });
});

describe("runIterate — malformed repo format", () => {
  it("throws when report.repo has no slash (e.g. 'badformat')", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ repo: "badformat" }));

    await expect(runIterate(makeOpts())).rejects.toThrow(
      'Unexpected repo format: "badformat" (expected "owner/name")',
    );
  });

  it("throws when report.repo has a leading slash (e.g. '/noowner')", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ repo: "/noowner" }));

    await expect(runIterate(makeOpts())).rejects.toThrow(
      'Unexpected repo format: "/noowner" (expected "owner/name")',
    );
  });
});
