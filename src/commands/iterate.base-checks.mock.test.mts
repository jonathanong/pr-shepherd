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

vi.mock("../cache/fix-attempts.mts", () => ({
  readFixAttempts: vi.fn().mockResolvedValue(null),
  writeFixAttempts: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../cache/iterate-stall.mts", () => ({
  readStallState: vi.fn().mockResolvedValue(null),
  writeStallState: vi.fn().mockResolvedValue(undefined),
}));

const { mockLoadConfig } = vi.hoisted(() => ({ mockLoadConfig: vi.fn() }));
vi.mock("../config/load.mts", () => ({ loadConfig: mockLoadConfig }));

import { runIterate } from "./iterate.mts";
import { runCheck } from "./check.mts";
import { updateReadyDelay } from "./ready-delay.mts";
import { readFixAttempts, writeFixAttempts } from "../cache/fix-attempts.mts";
import { readStallState, writeStallState } from "../cache/iterate-stall.mts";
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
    lastPushTime: undefined,
    ...overrides,
  };
}

function makeOpts(overrides: Partial<IterateCommandOptions> = {}): IterateCommandOptions {
  return {
    prNumber: 42,
    format: "json",
    noCache: true,
    cacheTtlSeconds: 300,
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
    cache: { ttlSeconds: 300 },
    iterate: {
      cooldownSeconds: 30,
      fixAttemptsPerThread: 3,
      stallTimeoutMinutes: 30,
      minimizeReviewSummaries: { bots: true, humans: true, approvals: false },
    },
    watch: { interval: "4m", readyDelayMinutes: 10, expiresHours: 8, maxTurns: 50 },
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
      autoRebase: true,
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

// ---------------------------------------------------------------------------
// base.checks — always carries all relevant checks regardless of action
// ---------------------------------------------------------------------------

describe("runIterate — base.checks carries passing + failing (regression: missing CI bug)", () => {
  it("regression: 5 passing + 1 infra failure → rerun_ci with failing check in base.checks", async () => {
    const infraCheck = {
      name: "build",
      status: "COMPLETED" as const,
      conclusion: "CANCELLED" as const,
      detailsUrl: "https://github.com/owner/repo/actions/runs/50",
      event: "pull_request",
      runId: "run-50",
      category: "failing" as const,
      failureKind: "infrastructure" as const,
      errorExcerpt: "Runner error: the runner crashed",
    };
    const passingChecks = ["lint", "typecheck", "test", "e2e", "security"].map((name) => ({
      name,
      status: "COMPLETED" as const,
      conclusion: "SUCCESS" as const,
      detailsUrl: `https://github.com/owner/repo/actions/runs/${name}`,
      event: "pull_request",
      runId: `run-${name}`,
      category: "passed" as const,
    }));
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: passingChecks,
          failing: [infraCheck],
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
    // All 6 checks visible — the bug was that the failing infra check disappeared from output.
    expect(result.checks).toHaveLength(6);
    const failing = result.checks.find((c) => c.name === "build");
    expect(failing).toBeDefined();
    expect(failing!.failureKind).toBe("infrastructure");
    expect(failing!.errorExcerpt).toBe("Runner error: the runner crashed");
    const passNames = result.checks
      .filter((c) => c.conclusion === "SUCCESS")
      .map((c) => c.name)
      .sort();
    expect(passNames).toEqual(["e2e", "lint", "security", "test", "typecheck"]);
  });

  it("flaky+BEHIND → rebase action with failing check still in base.checks", async () => {
    const flakyCheck = {
      name: "flaky-test",
      status: "COMPLETED" as const,
      conclusion: "FAILURE" as const,
      detailsUrl: "https://github.com/owner/repo/actions/runs/60",
      event: "pull_request",
      runId: "run-60",
      category: "failing" as const,
      failureKind: "flaky" as const,
      errorExcerpt: "Test is flaky: failed 1/3 runs",
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
          failing: [flakyCheck],
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

    expect(result.action).toBe("rebase");
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]!.name).toBe("flaky-test");
    expect(result.checks[0]!.failureKind).toBe("flaky");
    expect(result.checks[0]!.errorExcerpt).toBe("Test is flaky: failed 1/3 runs");
  });

  it("cooldown path returns checks: []", async () => {
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "log") {
        return Promise.resolve({ stdout: String(NOW - 5), stderr: "" });
      }
      return Promise.resolve({ stdout: "", stderr: "" });
    });

    const result = await runIterate(makeOpts({ cooldownSeconds: 30 }));

    expect(result.action).toBe("cooldown");
    expect(result.checks).toEqual([]);
  });

  it("wait path includes passing checks in base.checks", async () => {
    mockRunCheck.mockResolvedValue(makeReport()); // 1 passing check: "ci"
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: false,
      remainingSeconds: 300,
    });

    const result = await runIterate(makeOpts({ noAutoMarkReady: true }));

    expect(result.action).toBe("wait");
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]!.name).toBe("ci");
    expect(result.checks[0]!.conclusion).toBe("SUCCESS");
    expect(result.checks[0]!.failureKind).toBeUndefined();
  });

  it("skipped and filtered checks are excluded from base.checks", async () => {
    const skippedCheck = {
      name: "skipped-job",
      status: "COMPLETED" as const,
      conclusion: "SKIPPED" as const,
      detailsUrl: "https://github.com/owner/repo/actions/runs/70",
      event: "pull_request",
      runId: "run-70",
      category: "skipped" as const,
    };
    const filteredCheck = {
      name: "windows-only",
      status: "COMPLETED" as const,
      conclusion: "SUCCESS" as const,
      detailsUrl: "https://github.com/owner/repo/actions/runs/71",
      event: "pull_request",
      runId: "run-71",
      category: "filtered" as const,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        checks: {
          passing: [],
          failing: [],
          inProgress: [],
          skipped: [skippedCheck],
          filtered: [filteredCheck],
          filteredNames: ["windows-only"],
          blockedByFilteredCheck: false,
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: false,
      remainingSeconds: 300,
    });

    const result = await runIterate(makeOpts({ noAutoMarkReady: true }));

    expect(result.action).toBe("wait");
    expect(result.checks).toEqual([]);
  });

  it("passing check with null detailsUrl maps to detailsUrl: null in base.checks", async () => {
    // Exercises the `c.detailsUrl || null` false branch in buildRelevantChecks when
    // detailsUrl is null (StatusContext checks have no detailsUrl).
    mockRunCheck.mockResolvedValue(
      makeReport({
        checks: {
          passing: [
            {
              name: "status-check",
              status: "COMPLETED" as const,
              conclusion: "SUCCESS" as const,
              detailsUrl: null as unknown as string,
              event: null,
              runId: null,
              category: "passed" as const,
            },
          ],
          failing: [],
          inProgress: [],
          skipped: [],
          filtered: [],
          filteredNames: [],
          blockedByFilteredCheck: false,
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: false,
      remainingSeconds: 300,
    });

    const result = await runIterate(makeOpts({ noAutoMarkReady: true }));

    expect(result.action).toBe("wait");
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]!.detailsUrl).toBeNull();
  });
});
