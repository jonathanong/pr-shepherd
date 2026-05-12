/* eslint-disable max-lines */
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

import { runIterate } from "./iterate/index.mts";
import { runCheck } from "./check.mts";
import { updateReadyDelay } from "./ready-delay.mts";
import { readFixAttempts, writeFixAttempts } from "../state/fix-attempts.mts";
import { readStallState, writeStallState } from "../state/iterate-stall.mts";
import type { ShepherdReport, IterateCommandOptions, Review } from "../types.mts";

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

function makeReview(id: string, author: string, body: string): Review {
  return { id, author, authorType: "Unknown", body };
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
      fixAttemptsPerThread: 3,
      stallTimeoutMinutes: 30,
      minimizeApprovals: false,
      minimizeComments: "all" as "all" | "bots" | "users" | "none",
    },
    watch: { readyDelayMinutes: 10 },
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
  mockExecFile.mockImplementation((cmd: string, args: string[]) => {
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
  const botSummary = makeReview("PRR_BOT", "copilot-pull-request-reviewer", "overview");
  const genericBotSummary = makeReview("PRR_GEM", "gemini-code-assist", "overview");
  const bracketBotSummary = makeReview("PRR_BRK", "github-actions[bot]", "overview");
  const humanSummary = makeReview("PRR_HUMAN", "alice", "nice work");

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

    expect(result.fix.reviewSummaryIds).toEqual(["PRR_BOT"]);
    expect(result.fix.surfacedApprovals).toEqual([]);
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

    expect(result.fix.reviewSummaryIds).toEqual(["PRR_GEM"]);
  });

  it("always minimizes human summaries regardless of author type", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ reviewSummaries: [humanSummary] }));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });
    const result = await runIterate(makeOpts());
    if (result.action !== "fix_code") return;

    expect(result.fix.reviewSummaryIds).toEqual(["PRR_HUMAN"]);
    expect(result.fix.surfacedApprovals).toEqual([]);
  });

  it("minimizes both bot and human summaries unconditionally", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ reviewSummaries: [botSummary, humanSummary] }));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });
    const result = await runIterate(makeOpts());
    if (result.action !== "fix_code") return;

    expect(result.fix.reviewSummaryIds).toEqual(["PRR_BOT", "PRR_HUMAN"]);
    expect(result.fix.surfacedApprovals).toEqual([]);
  });

  it("minimizes only GitHub-classified bot summaries when minimizeComments=bots", async () => {
    const cfg = defaultConfig();
    cfg.iterate.minimizeComments = "bots";
    mockLoadConfig.mockReturnValue(cfg);
    mockRunCheck.mockResolvedValue(
      makeReport({
        reviewSummaries: [
          { ...botSummary, authorType: "Bot" },
          { ...humanSummary, authorType: "User" },
        ],
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
    expect(result.fix.reviewSummaryIds).toEqual(["PRR_BOT"]);
    expect(result.fix.resolveCommand.argv).toContain("PRR_BOT");
    expect(result.fix.resolveCommand.argv).not.toContain("PRR_HUMAN");
  });

  it("surfaces first-look summaries without minimization when minimizeComments=none", async () => {
    const cfg = defaultConfig();
    cfg.iterate.minimizeComments = "none";
    mockLoadConfig.mockReturnValue(cfg);
    const summary = { id: "PRR_FL", author: "alice", authorType: "User" as const, body: "FYI" };
    mockRunCheck.mockResolvedValue(makeReport({ firstLookSummaries: [summary] }));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") return;
    expect(result.fix.firstLookSummaries).toEqual([summary]);
    expect(result.fix.reviewSummaryIds).toEqual([]);
    expect(result.fix.resolveCommand.hasMutations).toBe(false);
  });

  it("omits APPROVED reviews from minimize list by default (approvals: false)", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        approvedReviews: [
          { id: "PRR_AP", author: "alice", authorType: "Unknown" as const, body: "" },
        ],
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

  it("includes APPROVED reviews in minimize list when cfg.minimizeApprovals is true", async () => {
    const cfg = defaultConfig();
    cfg.iterate.minimizeApprovals = true;
    mockLoadConfig.mockReturnValue(cfg);
    mockRunCheck.mockResolvedValue(
      makeReport({
        approvedReviews: [
          { id: "PRR_AP", author: "alice", authorType: "Unknown" as const, body: "" },
        ],
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });
    const result = await runIterate(makeOpts());
    if (result.action !== "fix_code") return;

    expect(result.fix.reviewSummaryIds).toEqual(["PRR_AP"]);
  });

  it("filters APPROVED reviews through minimizeComments when approval minimization is enabled", async () => {
    const cfg = defaultConfig();
    cfg.iterate.minimizeApprovals = true;
    cfg.iterate.minimizeComments = "bots";
    mockLoadConfig.mockReturnValue(cfg);
    mockRunCheck.mockResolvedValue(
      makeReport({
        approvedReviews: [
          { id: "PRR_AP_BOT", author: "app", authorType: "Bot", body: "" },
          { id: "PRR_AP_USER", author: "alice", authorType: "User", body: "" },
        ],
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());
    if (result.action !== "fix_code") return;

    expect(result.fix.reviewSummaryIds).toEqual(["PRR_AP_BOT"]);
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
      authorType: "Unknown" as const,
      body: "Use a const here.\n\n```suggestion\nconst foo = 1;\n```",
      url: "",
      createdAtUnix: NOW - 3600,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: {
          actionable: [t1],
          resolutionOnly: [],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [],
        },
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

    expect(result.fix.reviewSummaryIds).toEqual(["PRR_BOT"]);
  });

  it("editedSummaries are surfaced in fix_code but excluded from reviewSummaryIds (not re-minimized)", async () => {
    // A seen summary triggers fix_code (it needs minimizing); edited summary must NOT join the queue.
    const seenSummary = makeReview("PRR_SEEN", "copilot", "Old review.");
    const editedSummary = makeReview("PRR_ED", "copilot", "Updated.");
    mockRunCheck.mockResolvedValue(
      makeReport({ reviewSummaries: [seenSummary], editedSummaries: [editedSummary] }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") return;

    expect(result.fix.editedSummaries).toEqual([editedSummary]);
    expect(result.fix.reviewSummaryIds).toContain("PRR_SEEN");
    expect(result.fix.reviewSummaryIds).not.toContain("PRR_ED");
    expect(result.fix.instructions.join("\n")).toContain("edited since first look");
  });

  it("surfaces body in firstLookSummaries when summary comes from report.firstLookSummaries", async () => {
    const summary = makeReview("PRR_FL", "copilot", "Nice work.");
    mockRunCheck.mockResolvedValue(makeReport({ firstLookSummaries: [summary] }));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") return;

    expect(result.fix.firstLookSummaries).toEqual([summary]);
    expect(result.fix.reviewSummaryIds).toContain("PRR_FL");
  });
});
