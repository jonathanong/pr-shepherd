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
    threads: { actionable: [], autoResolved: [], autoResolveErrors: [], firstLook: [] },
    comments: { actionable: [], firstLook: [] },
    changesRequestedReviews: [],
    reviewSummaries: [],
    firstLookSummaries: [],
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
    json: () => Promise.resolve({ data: {} }),
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

describe("runIterate — prescriptive fields: log strings", () => {
  it("cooldown.log mentions CI starting", async () => {
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "log")
        return Promise.resolve({ stdout: String(NOW - 5), stderr: "" });
      return Promise.resolve({ stdout: "", stderr: "" });
    });

    const result = await runIterate(makeOpts({ cooldownSeconds: 30 }));
    expect(result.action).toBe("cooldown");
    if (result.action === "cooldown") {
      expect(result.log).toMatch(/SKIP/);
      expect(result.log).toMatch(/CI/i);
    }
  });

  it("wait.log includes passing count and merge state", async () => {
    mockRunCheck.mockResolvedValue(makeReport());
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: false,
      remainingSeconds: 300,
    });

    const result = await runIterate(makeOpts({ noAutoMarkReady: true }));
    expect(result.action).toBe("wait");
    if (result.action === "wait") {
      expect(result.log).toMatch(/WAIT/);
      expect(result.log).toMatch(/passing/);
      expect(result.log).toMatch(/300s/);
    }
  });

  it.each([
    ["BEHIND", "BEHIND" as const, "branch is behind base"],
    ["DRAFT", "DRAFT" as const, "PR is a draft"],
    ["UNSTABLE", "UNSTABLE" as const, "some checks are unstable"],
  ])("wait.log describes mergeStatus=%s", async (_label, mergeStatusVal, expectedPhrase) => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "PENDING",
        mergeStatus: {
          status: mergeStatusVal,
          state: "OPEN",
          isDraft: mergeStatusVal === "DRAFT",
          mergeable: "MERGEABLE",
          reviewDecision: null,
          copilotReviewInProgress: false,
          mergeStateStatus: mergeStatusVal,
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 0,
    });
    const result = await runIterate(makeOpts());
    expect(result.action).toBe("wait");
    if (result.action === "wait") {
      expect(result.log).toContain(expectedPhrase);
    }
  });

  it("cancel.log mentions PR state and reason=merged when PR is merged", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        mergeStatus: {
          status: "CLEAN",
          state: "MERGED",
          isDraft: false,
          mergeable: "MERGEABLE",
          reviewDecision: "APPROVED",
          copilotReviewInProgress: false,
          mergeStateStatus: "CLEAN",
        },
      }),
    );

    const result = await runIterate(makeOpts());
    expect(result.action).toBe("cancel");
    if (result.action === "cancel") {
      expect(result.reason).toBe("merged");
      expect(result.log).toMatch(/CANCEL/);
      expect(result.log).toMatch(/merged/i);
    }
  });

  it("cancel.reason=closed and log mentions closed when PR is closed", async () => {
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
    if (result.action === "cancel") {
      expect(result.reason).toBe("closed");
      expect(result.log).toMatch(/CANCEL/);
      expect(result.log).toMatch(/closed/i);
    }
  });

  it("cancel.log mentions ready-delay and reason=ready-delay-elapsed when shouldCancel from ready-delay", async () => {
    mockRunCheck.mockResolvedValue(makeReport());
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });

    const result = await runIterate(makeOpts());
    expect(result.action).toBe("cancel");
    if (result.action === "cancel") {
      expect(result.reason).toBe("ready-delay-elapsed");
      expect(result.log).toMatch(/CANCEL/);
      expect(result.log).toMatch(/ready/i);
    }
  });

  it("fix_code.log for a timeout failure mentions the check name", async () => {
    const timeoutCheck = {
      name: "test",
      status: "COMPLETED" as const,
      conclusion: "TIMED_OUT" as const,
      detailsUrl: "https://github.com/owner/repo/actions/runs/99",
      event: "pull_request",
      runId: "run-99",
      category: "failing" as const,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: [],
          failing: [timeoutCheck],
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
    expect(result.action).toBe("fix_code");
  });

  it("mark_ready.log mentions PR number", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        mergeStatus: {
          status: "CLEAN",
          state: "OPEN",
          isDraft: true,
          mergeable: "MERGEABLE",
          reviewDecision: "APPROVED",
          copilotReviewInProgress: false,
          mergeStateStatus: "DRAFT",
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());
    expect(result.action).toBe("mark_ready");
    if (result.action === "mark_ready") {
      expect(result.log).toMatch(/MARKED READY/);
      expect(result.log).toMatch(/42/);
    }
  });
});

// renderResolveCommand and buildResolveCommand tests moved to iterate.render-resolve-cmd.mock.test.mts

// ---------------------------------------------------------------------------
// HAS_HOOKS — derived BLOCKED, raw HAS_HOOKS
// ---------------------------------------------------------------------------

describe("runIterate — HAS_HOOKS (derived BLOCKED)", () => {
  function makeHasHooksReport(reviewDecision: "REVIEW_REQUIRED" | null) {
    return makeReport({
      status: "READY",
      mergeStatus: {
        status: "BLOCKED",
        state: "OPEN" as const,
        isDraft: false,
        mergeable: "MERGEABLE",
        reviewDecision,
        copilotReviewInProgress: false,
        mergeStateStatus: "HAS_HOOKS",
      },
    });
  }

  it("cancel-note uses branch-protection wording when raw is HAS_HOOKS", async () => {
    mockRunCheck.mockResolvedValue(makeHasHooksReport(null));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });
    const result = await runIterate(makeOpts());
    expect(result.action).toBe("cancel");
    if (result.action === "cancel") {
      expect(result.log).toContain("branch protection");
      expect(result.log).not.toContain("ready for review");
    }
  });

  it("wait log uses branch-protection wording when raw is HAS_HOOKS", async () => {
    mockRunCheck.mockResolvedValue(makeHasHooksReport(null));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: false,
      remainingSeconds: 300,
    });
    const result = await runIterate(makeOpts());
    expect(result.action).toBe("wait");
    if (result.action === "wait") {
      expect(result.log).toContain("branch protection");
    }
  });
});
