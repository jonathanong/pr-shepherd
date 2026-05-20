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

vi.mock("./check.mts", () => ({ runCheck: vi.fn() }));
vi.mock("./ready-delay.mts", () => ({ updateReadyDelay: vi.fn() }));
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
vi.mock("../state/seen-comments.mts", () => ({
  markSeen: vi.fn().mockResolvedValue(undefined),
}));

const { mockLoadConfig } = vi.hoisted(() => ({ mockLoadConfig: vi.fn() }));
vi.mock("../config/load.mts", () => ({ loadConfig: mockLoadConfig }));

import { runIterate } from "./iterate/index.mts";
import { runCheck } from "./check.mts";
import { updateReadyDelay } from "./ready-delay.mts";
import { readFixAttempts, writeFixAttempts } from "../state/fix-attempts.mts";
import { readStallState, writeStallState } from "../state/iterate-stall.mts";
import { markSeen } from "../state/seen-comments.mts";
import type { ShepherdReport, IterateCommandOptions } from "../types.mts";

const mockRunCheck = vi.mocked(runCheck);
const mockUpdateReadyDelay = vi.mocked(updateReadyDelay);
const mockReadFixAttempts = vi.mocked(readFixAttempts);
const mockWriteFixAttempts = vi.mocked(writeFixAttempts);
const mockReadStallState = vi.mocked(readStallState);
const mockWriteStallState = vi.mocked(writeStallState);
const mockMarkSeen = vi.mocked(markSeen);

function makeReport(overrides: Partial<ShepherdReport> = {}): ShepherdReport {
  return {
    pr: 42,
    nodeId: "PR_kgDOAAA",
    repo: "owner/repo",
    status: "READY",
    baseBranch: "main",
    branchProtection: null,
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
      passing: [],
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
    readyDelaySeconds: 600,
    ...overrides,
  };
}

export function registerHooks(): void {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecFile.mockResolvedValue({ stdout: "abc1234\n", stderr: "" });
    mockLoadConfig.mockReturnValue({
      iterate: {
        fixAttemptsPerThread: 3,
        stallTimeoutMinutes: 60,
        minimizeApprovals: false,
      },
      watch: { readyDelayMinutes: 10 },
      resolve: {
        concurrency: 4,
        shaPoll: { intervalMs: 2000, maxAttempts: 10 },
        fetchReviewSummaries: true,
      },
      checks: { ciTriggerEvents: ["pull_request"] },
      mergeStatus: { blockingReviewerLogins: [] },
      actions: { autoResolveOutdated: false, autoMarkReady: false, commitSuggestions: false },
    });
    mockReadFixAttempts.mockResolvedValue(null);
    mockWriteFixAttempts.mockResolvedValue(undefined);
    mockReadStallState.mockResolvedValue(null);
    mockWriteStallState.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
}

export {
  makeOpts,
  makeReport,
  mockExecFile,
  mockFetch,
  mockLoadConfig,
  mockReadFixAttempts,
  mockReadStallState,
  mockMarkSeen,
  mockRunCheck,
  mockUpdateReadyDelay,
  mockWriteFixAttempts,
  mockWriteStallState,
  readFixAttempts,
  readStallState,
  runCheck,
  runIterate,
  updateReadyDelay,
  writeFixAttempts,
  writeStallState,
};
export type { IterateCommandOptions, ShepherdReport };
