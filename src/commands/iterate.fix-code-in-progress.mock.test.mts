import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

const { mockLoadConfig } = vi.hoisted(() => ({ mockLoadConfig: vi.fn() }));
vi.mock("../config/load.mts", () => ({ loadConfig: mockLoadConfig }));

import { runIterate } from "./iterate.mts";
import { runCheck } from "./check.mts";
import { updateReadyDelay } from "./ready-delay.mts";
import { readFixAttempts, writeFixAttempts } from "../state/fix-attempts.mts";
import { readStallState, writeStallState } from "../state/iterate-stall.mts";
import type { ShepherdReport, IterateCommandOptions } from "../types.mts";

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
    cooldownSeconds: 30,
    readyDelaySeconds: 600,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockExecFile.mockResolvedValue({ stdout: "abc1234\n", stderr: "" });
  mockLoadConfig.mockReturnValue({
    iterate: {
      cooldownSeconds: 30,
      fixAttemptsPerThread: 3,
      stallTimeoutMinutes: 60,
      minimizeApprovals: false,
    },
    watch: { interval: "4m", readyDelayMinutes: 10 },
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

describe("fix_code — in-progress run cancellation", () => {
  it("inProgressRunIds populated from inProgress checks, excluding CLI-cancelled IDs", async () => {
    const thread = {
      id: "PRRT_1",
      path: "src/a.ts",
      line: 1,
      startLine: null,
      body: "fix this",
      url: "https://github.com/owner/repo/pull/42#discussion_r1",
      author: "alice",
      isOutdated: false,
      isResolved: false,
      isMinimized: false,
      createdAtUnix: 0,
    };
    const inProgressCheck = {
      name: "ci",
      status: "IN_PROGRESS" as const,
      conclusion: null,
      detailsUrl: "https://github.com/owner/repo/actions/runs/run-in-1",
      event: "pull_request" as const,
      runId: "run-in-1",
      category: "in_progress" as const,
    };
    // Failing check: CLI will cancel this runId; must NOT appear in inProgressRunIds.
    const failingCheck = {
      name: "lint",
      status: "COMPLETED" as const,
      conclusion: "FAILURE" as const,
      detailsUrl: "https://github.com/owner/repo/actions/runs/run-fail-1",
      event: "pull_request" as const,
      runId: "run-fail-1",
      summary: "tests failed",
      category: "failing" as const,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        threads: {
          actionable: [thread],
          resolutionOnly: [],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [],
        },
        checks: {
          passing: [],
          failing: [failingCheck],
          inProgress: [inProgressCheck],
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
    // Stub cancel REST call so the CLI "cancels" run-fail-1.
    mockFetch.mockResolvedValue({ ok: true, status: 202, json: async () => ({}) });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code" && result.fix.mode === "rebase-and-push") {
      expect(result.fix.inProgressRunIds).toContain("run-in-1");
      expect(result.fix.inProgressRunIds).not.toContain("run-fail-1");
      expect(result.fix.instructions[0]).toMatch(/Cancel in-progress CI runs first/);
    }
  });

  it("inProgressRunIds is empty when needsPush is false (summary-only dispatch)", async () => {
    const inProgressCheck = {
      name: "ci",
      status: "IN_PROGRESS" as const,
      conclusion: null,
      detailsUrl: "https://github.com/owner/repo/actions/runs/run-in-2",
      event: "pull_request" as const,
      runId: "run-in-2",
      category: "in_progress" as const,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "PENDING",
        checks: {
          passing: [],
          failing: [],
          inProgress: [inProgressCheck],
          skipped: [],
          filtered: [],
          filteredNames: [],
          blockedByFilteredCheck: false,
        },
        reviewSummaries: [{ id: "PRR_BOT", author: "bot", body: "looks good" }],
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    if (result.action === "fix_code" && result.fix.mode === "rebase-and-push") {
      expect(result.fix.inProgressRunIds).toHaveLength(0);
      expect(result.fix.instructions.join("\n")).not.toMatch(/Cancel in-progress CI runs first/);
    }
  });
});
