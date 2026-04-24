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

// ---------------------------------------------------------------------------
// Review summary minimize — issue #70
// ---------------------------------------------------------------------------

describe("runIterate — review summary auto-minimize", () => {
  const botSummary = { id: "PRR_BOT", author: "copilot-pull-request-reviewer", body: "overview" };
  const genericBotSummary = { id: "PRR_GEM", author: "gemini-code-assist", body: "overview" };
  const bracketBotSummary = { id: "PRR_BRK", author: "github-actions[bot]", body: "overview" };
  const humanSummary = { id: "PRR_HUMAN", author: "alice", body: "nice work" };

  it("emits fix_code with reviewSummaryIds when only a bot summary exists", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ reviewSummaries: [botSummary] }));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") return;
    expect(result.fix.mode).toBe("rebase-and-push");
    if (result.fix.mode !== "rebase-and-push") return;
    expect(result.fix.reviewSummaryIds).toEqual(["PRR_BOT"]);
    expect(result.fix.surfacedSummaries).toEqual([]);
    expect(result.fix.resolveCommand.argv).toContain("--minimize-comment-ids");
    expect(result.fix.resolveCommand.argv).toContain("PRR_BOT");
    expect(result.fix.resolveCommand.requiresHeadSha).toBe(false);
  });

  it("classifies the `*[bot]` login suffix as a bot", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ reviewSummaries: [bracketBotSummary] }));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });
    const result = await runIterate(makeOpts());
    if (result.action !== "fix_code") return;
    if (result.fix.mode !== "rebase-and-push") return;
    expect(result.fix.reviewSummaryIds).toEqual(["PRR_BRK"]);
  });

  it("classifies known bot logins (gemini-code-assist) as bots", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ reviewSummaries: [genericBotSummary] }));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });
    const result = await runIterate(makeOpts());
    if (result.action !== "fix_code") return;
    if (result.fix.mode !== "rebase-and-push") return;
    expect(result.fix.reviewSummaryIds).toEqual(["PRR_GEM"]);
  });

  it("auto-minimizes human summaries when cfg.humans is true (default)", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ reviewSummaries: [humanSummary] }));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });
    const result = await runIterate(makeOpts());
    if (result.action !== "fix_code") return;
    if (result.fix.mode !== "rebase-and-push") return;
    expect(result.fix.reviewSummaryIds).toEqual(["PRR_HUMAN"]);
    expect(result.fix.surfacedSummaries).toEqual([]);
  });

  it("surfaces (without minimizing) human summaries when cfg.humans is false", async () => {
    const cfg = defaultConfig();
    cfg.iterate.minimizeReviewSummaries.humans = false;
    mockLoadConfig.mockReturnValue(cfg);
    mockRunCheck.mockResolvedValue(makeReport({ reviewSummaries: [botSummary, humanSummary] }));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });
    const result = await runIterate(makeOpts());
    if (result.action !== "fix_code") return;
    if (result.fix.mode !== "rebase-and-push") return;
    expect(result.fix.reviewSummaryIds).toEqual(["PRR_BOT"]);
    expect(result.fix.surfacedSummaries).toEqual([humanSummary]);
  });

  it("surfaces (without minimizing) bot summaries when cfg.bots is false", async () => {
    const cfg = defaultConfig();
    cfg.iterate.minimizeReviewSummaries.bots = false;
    mockLoadConfig.mockReturnValue(cfg);
    mockRunCheck.mockResolvedValue(makeReport({ reviewSummaries: [botSummary] }));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });
    const result = await runIterate(makeOpts());
    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") return;
    if (result.fix.mode !== "rebase-and-push") return;
    expect(result.fix.reviewSummaryIds).toEqual([]);
    expect(result.fix.surfacedSummaries).toEqual([botSummary]);
  });

  it("emits fix_code with only surfaced summaries (no minimize, no push) when both toggles are off", async () => {
    const cfg = defaultConfig();
    cfg.iterate.minimizeReviewSummaries.bots = false;
    cfg.iterate.minimizeReviewSummaries.humans = false;
    mockLoadConfig.mockReturnValue(cfg);
    mockRunCheck.mockResolvedValue(makeReport({ reviewSummaries: [botSummary, humanSummary] }));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });
    const result = await runIterate(makeOpts());
    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") return;
    if (result.fix.mode !== "rebase-and-push") return;
    expect(result.fix.reviewSummaryIds).toEqual([]);
    expect(result.fix.surfacedSummaries).toEqual([botSummary, humanSummary]);
    expect(result.fix.resolveCommand.hasMutations).toBe(false);
  });

  it("omits APPROVED reviews from minimize list by default (approvals: false)", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        approvedReviews: [{ id: "PRR_AP", author: "alice", body: "" }],
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });
    const result = await runIterate(makeOpts());
    expect(result.action).toBe("wait");
  });

  it("includes APPROVED reviews in minimize list when cfg.approvals is true", async () => {
    const cfg = defaultConfig();
    cfg.iterate.minimizeReviewSummaries.approvals = true;
    mockLoadConfig.mockReturnValue(cfg);
    mockRunCheck.mockResolvedValue(
      makeReport({
        approvedReviews: [{ id: "PRR_AP", author: "alice", body: "" }],
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });
    const result = await runIterate(makeOpts());
    if (result.action !== "fix_code") return;
    if (result.fix.mode !== "rebase-and-push") return;
    expect(result.fix.reviewSummaryIds).toEqual(["PRR_AP"]);
  });

  it("summary-only PR triggers fix_code (not wait) so the summary can be minimized", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ reviewSummaries: [botSummary] }));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });
    const result = await runIterate(makeOpts());
    expect(result.action).toBe("fix_code");
  });

  it("includes reviewSummaryIds in fix_code result when both a thread and a bot summary are present", async () => {
    const t1 = {
      id: "PRRT_x",
      isResolved: false,
      isOutdated: false,
      isMinimized: false,
      path: "src/foo.mts",
      line: 10,
      startLine: null,
      author: "reviewer",
      body: "Use a const here.\n\n```suggestion\nconst foo = 1;\n```",
      createdAtUnix: NOW - 3600,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: { actionable: [t1], autoResolved: [], autoResolveErrors: [] },
        reviewSummaries: [botSummary],
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") return;
    expect(result.fix.mode).toBe("rebase-and-push");
    if (result.fix.mode !== "rebase-and-push") return;
    expect(result.fix.reviewSummaryIds).toEqual(["PRR_BOT"]);
  });
});
