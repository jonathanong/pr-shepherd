import { vi, beforeEach, afterEach } from "vitest";

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

vi.mock("../../src/commands/check.mts", () => ({ runCheck: vi.fn() }));
vi.mock("../../src/commands/ready-delay.mts", () => ({ updateReadyDelay: vi.fn() }));
vi.mock("../../src/github/client.mts", () => ({
  getCurrentPrNumber: vi.fn().mockResolvedValue(42),
}));
vi.mock("../../src/state/fix-attempts.mts", () => ({
  readFixAttempts: vi.fn().mockResolvedValue(null),
  writeFixAttempts: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/state/iterate-stall.mts", () => ({
  readStallState: vi.fn().mockResolvedValue(null),
  writeStallState: vi.fn().mockResolvedValue(undefined),
  clearStallState: vi.fn().mockResolvedValue(undefined),
}));

const { mockLoadConfig } = vi.hoisted(() => ({ mockLoadConfig: vi.fn() }));
vi.mock("../../src/config/load.mts", () => ({ loadConfig: mockLoadConfig }));

import { runCheck } from "../../src/commands/check.mts";
import { updateReadyDelay } from "../../src/commands/ready-delay.mts";
import { getCurrentPrNumber } from "../../src/github/client.mts";
import { readFixAttempts, writeFixAttempts } from "../../src/state/fix-attempts.mts";
import {
  clearStallState,
  readStallState,
  writeStallState,
} from "../../src/state/iterate-stall.mts";
import {
  buildEscalateHumanMessage,
  buildEscalateSuggestion,
  checkEscalateTriggers,
} from "../../src/commands/iterate/escalate.mts";
import {
  buildRelevantChecks,
  buildWaitLog,
  getCurrentHeadSha,
} from "../../src/commands/iterate/helpers.mts";
import type { IterateCommandOptions, Review, ShepherdReport } from "../../src/types.mts";

const mockRunCheck = vi.mocked(runCheck);
const mockUpdateReadyDelay = vi.mocked(updateReadyDelay);
const mockGetCurrentPrNumber = vi.mocked(getCurrentPrNumber);
const mockReadFixAttempts = vi.mocked(readFixAttempts);
const mockWriteFixAttempts = vi.mocked(writeFixAttempts);
const mockReadStallState = vi.mocked(readStallState);
const mockWriteStallState = vi.mocked(writeStallState);
const mockClearStallState = vi.mocked(clearStallState);
const NOW = 1_700_000_000;
const READY_STATE_DEFAULT = { isReady: true, shouldCancel: false, remainingSeconds: 300 };

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
      blockingBotReviewInProgress: false,
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
    branchProtection: null,
    ...overrides,
  };
}

function makeOpts(overrides: Partial<IterateCommandOptions> = {}): IterateCommandOptions {
  return { prNumber: 42, format: "json", readyDelaySeconds: 600, ...overrides };
}

function makeReview(id: string, author: string, body: string): Review {
  return { id, author, authorType: "Unknown", body };
}

function defaultConfig() {
  return {
    botUsernames: ["coderabbitai"],
    ignoreChecks: [],
    iterate: {
      fixAttemptsPerThread: 3,
      stallTimeoutMinutes: 60,
      minimizeApprovals: false,
      minimizeComments: "all" as "all" | "bots" | "users" | "none",
    },
    watch: { readyDelayMinutes: 10 },
    resolve: {
      concurrency: 4,
      shaPoll: { intervalMs: 2000, maxAttempts: 10 },
    },
    checks: { ciTriggerEvents: ["pull_request", "pull_request_target"] },
    mergeStatus: { blockingReviewerLogins: ["copilot"] },
    actions: {
      autoResolveOutdated: true,
      autoMinimizeSuppressed: true,
      autoMarkReady: true,
      commitSuggestions: true,
      neverCancelRuns: [] as string[],
    },
  };
}

function registerIterateHooks(config = defaultConfig): void {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadConfig.mockReturnValue(config());
    process.env["GH_TOKEN"] = "test-token";
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "rev-parse") {
        return Promise.resolve({ stdout: "abc123", stderr: "" });
      }
      return Promise.resolve({ stdout: "", stderr: "" });
    });
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: () => Promise.resolve({ data: {} }),
      text: () => Promise.resolve('{"data":{}}'),
    });
    vi.useFakeTimers();
    vi.setSystemTime(NOW * 1000);
    mockUpdateReadyDelay.mockResolvedValue(READY_STATE_DEFAULT);
    mockReadFixAttempts.mockResolvedValue(null);
    mockWriteFixAttempts.mockResolvedValue(undefined);
    mockReadStallState.mockResolvedValue(null);
    mockWriteStallState.mockResolvedValue(undefined);
    mockClearStallState.mockResolvedValue(undefined);
  });
  afterEach(() => vi.useRealTimers());
}

export {
  NOW,
  buildEscalateHumanMessage,
  buildEscalateSuggestion,
  buildRelevantChecks,
  buildWaitLog,
  checkEscalateTriggers,
  defaultConfig,
  getCurrentHeadSha,
  makeOpts,
  makeReport,
  makeReview,
  mockExecFile,
  mockFetch,
  mockGetCurrentPrNumber,
  mockClearStallState,
  mockLoadConfig,
  mockReadFixAttempts,
  mockReadStallState,
  mockRunCheck,
  mockUpdateReadyDelay,
  mockWriteFixAttempts,
  mockWriteStallState,
  registerIterateHooks,
};
