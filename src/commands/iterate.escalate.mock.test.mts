/* eslint-disable max-lines */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Hoist mocks before imports so modules capture the mocked versions.

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
  clearStallState: vi.fn().mockResolvedValue(undefined),
}));

const { mockLoadConfig } = vi.hoisted(() => ({ mockLoadConfig: vi.fn() }));
vi.mock("../config/load.mts", () => ({ loadConfig: mockLoadConfig }));

import { runIterate } from "./iterate/index.mts";
import { runCheck } from "./check.mts";
import { updateReadyDelay } from "./ready-delay.mts";
import { getCurrentPrNumber } from "../github/client.mts";
import { readFixAttempts, writeFixAttempts } from "../state/fix-attempts.mts";
import { readStallState, writeStallState } from "../state/iterate-stall.mts";
import {
  buildEscalateHumanMessage,
  buildEscalateSuggestion,
  checkEscalateTriggers,
} from "./iterate/escalate.mts";
import { buildRelevantChecks, buildWaitLog, getCurrentHeadSha } from "./iterate/helpers.mts";
import type { ShepherdReport, IterateCommandOptions } from "../types.mts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockRunCheck = vi.mocked(runCheck);
const mockUpdateReadyDelay = vi.mocked(updateReadyDelay);
const mockGetCurrentPrNumber = vi.mocked(getCurrentPrNumber);
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
// Escalate
// ---------------------------------------------------------------------------

const THREAD = {
  id: "thread-1",
  isResolved: false,
  isOutdated: false,
  isMinimized: false,
  path: "src/foo.mts",
  line: 10,
  startLine: null,
  author: "reviewer",
  authorType: "Unknown" as const,
  body: "Fix this",
  url: "",
  createdAtUnix: NOW - 3600,
};

const RESOLUTION_ONLY_THREAD = {
  ...THREAD,
  id: "thread-resolution-only",
  isOutdated: true,
  line: null,
  body: "Already addressed on an old diff",
};

describe("runIterate — escalate (fix-thrash)", () => {
  it("escalates when a thread has been attempted >= fixAttemptsPerThread times", async () => {
    mockReadFixAttempts.mockResolvedValue({ headSha: "abc123", threadAttempts: { "thread-1": 3 } });
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: {
          actionable: [THREAD],
          resolutionOnly: [],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [],
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("escalate");
    if (result.action === "escalate") {
      expect(result.escalate.triggers).toContain("fix-thrash");
      expect(result.escalate.thrashHistory).toHaveLength(1);
      expect(result.escalate.thrashHistory?.[0]?.threadId).toBe("thread-1");
      expect(result.escalate.thrashHistory?.[0]?.attempts).toBe(3);
    }
  });

  it("does NOT escalate when attempt count is below threshold (attempt=2)", async () => {
    mockReadFixAttempts.mockResolvedValue({ headSha: "abc123", threadAttempts: { "thread-1": 2 } });
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: {
          actionable: [THREAD],
          resolutionOnly: [],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [],
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

  it("accumulates attempt counts when HEAD SHA changes and does NOT immediately escalate", async () => {
    // Stored state has SHA 'old-sha' with 1 attempt — new SHA triggers increment to 2, still below threshold.
    mockReadFixAttempts.mockResolvedValue({
      headSha: "old-sha",
      threadAttempts: { "thread-1": 1 },
    });
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: {
          actionable: [THREAD],
          resolutionOnly: [],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [],
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    // Old SHA 'old-sha' ≠ current 'abc123' → counts increment (1→2) → below threshold → no escalation.
    expect(result.action).toBe("fix_code");
  });

  it("increments attempt count and calls writeFixAttempts on fix_code dispatch", async () => {
    // Use a different stored SHA so isNewSha=true and the increment fires.
    mockReadFixAttempts.mockResolvedValue({
      headSha: "old-sha",
      threadAttempts: { "thread-1": 1 },
    });
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: {
          actionable: [THREAD],
          resolutionOnly: [],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [],
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
    expect(mockWriteFixAttempts).toHaveBeenCalledOnce();
    const [, written] = mockWriteFixAttempts.mock.calls[0]!;
    expect(written.threadAttempts["thread-1"]).toBe(2);
  });
});

describe("escalate message helpers", () => {
  it("includes ambiguous comments and fallback suggestions", () => {
    const message = buildEscalateHumanMessage(
      {
        triggers: ["thread-missing-location"],
        unresolvedThreads: [],
        ambiguousComments: [
          {
            id: "c-ambiguous",
            author: "reviewer",
            authorType: "User",
            body: "Please consider the whole design\nmore detail",
            url: "",
          },
        ],
        changesRequestedReviews: [],
        suggestion: "manual",
      },
      42,
    );

    expect(message).toContain("comment `c-ambiguous`");
    expect(message).toContain("Please consider the whole design");
    expect(buildEscalateSuggestion([])).toBe("Ambiguous state — inspect the PR and act manually");
  });

  it("renders thread/review item fallbacks, thrash attempts, and singular stall wording", () => {
    const message = buildEscalateHumanMessage(
      {
        triggers: ["fix-thrash"],
        unresolvedThreads: [
          {
            id: "t-no-loc",
            path: null,
            line: null,
            startLine: undefined,
            author: "reviewer",
            authorType: "User",
            body: "Thread body\nmore detail",
            url: "",
          },
        ],
        ambiguousComments: [],
        changesRequestedReviews: [
          { id: "r1", author: "reviewer", authorType: "User", body: "Review body\nmore detail" },
        ],
        thrashHistory: [{ threadId: "t-no-loc", attempts: 3 }],
        suggestion: "manual",
      },
      42,
    );

    expect(message).toContain("(no location)");
    expect(message).toContain("review `r1`");
    expect(message).toContain("attempted 3 times");
    expect(buildEscalateSuggestion(["stall-timeout"], "1")).toContain("1 minute —");
    expect(buildEscalateSuggestion(["base-branch-unknown"])).toContain("base branch");
  });

  it("uses zero attempts for missing thread attempt records", () => {
    mockLoadConfig.mockReturnValue(defaultConfig());
    const { triggers, thrashHistory } = checkEscalateTriggers(
      [
        {
          id: "t1",
          isResolved: false,
          isOutdated: false,
          isMinimized: false,
          path: "src/a.ts",
          line: 1,
          startLine: null,
          author: "reviewer",
          authorType: "User",
          body: "body",
          url: "",
          createdAtUnix: 0,
        },
      ],
      [],
      [],
      [],
      [],
      {},
      false,
    );

    expect(triggers).toEqual([]);
    expect(thrashHistory).toBeUndefined();
  });
});

describe("iterate helper fallbacks", () => {
  it("returns null when current HEAD cannot be read", async () => {
    mockExecFile.mockRejectedValueOnce(new Error("not a git repo"));
    await expect(getCurrentHeadSha()).resolves.toBeNull();
  });

  it("covers relevant-check filtering and wait-log branches", () => {
    const report = makeReport({
      checks: {
        passing: [
          {
            name: "skipped",
            status: "COMPLETED",
            conclusion: "SKIPPED",
            detailsUrl: "",
            event: "pull_request",
            runId: "run-skip",
            category: "passed",
          },
        ],
        failing: [
          {
            name: "failed",
            status: "COMPLETED",
            conclusion: "FAILURE",
            detailsUrl: "",
            event: "pull_request",
            runId: "run-fail",
            category: "failing",
            workflowName: "CI",
            jobName: "test",
            failedStep: "Run tests",
            summary: "failed summary",
          },
        ],
        inProgress: [],
        skipped: [],
        filtered: [],
        filteredNames: [],
        blockedByFilteredCheck: false,
      },
    });

    expect(buildRelevantChecks(report).map((check) => check.name)).toEqual(["failed"]);
    expect(
      buildWaitLog({
        pr: 42,
        repo: "owner/repo",
        status: "IN_PROGRESS",
        state: "OPEN",
        mergeStateStatus: "BEHIND",
        mergeStatus: "BEHIND",
        reviewDecision: null,
        blockingBotReviewInProgress: false,
        isDraft: false,
        shouldCancel: false,
        remainingSeconds: 0,
        summary: { passing: 1, skipped: 0, filtered: 0, inProgress: 0 },
        baseBranch: "main",
        checks: [],
      }),
    ).toContain("branch is behind base");
  });
});

describe("runIterate — no PR", () => {
  it("throws when no PR number is passed and no current PR is found", async () => {
    mockGetCurrentPrNumber.mockResolvedValueOnce(null);
    await expect(runIterate({ format: "json" })).rejects.toThrow("No open PR found");
  });
});

describe("runIterate — escalate (pr-level-changes-requested)", () => {
  it("escalates when changesRequestedReviews with no inline threads or CI failures", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        changesRequestedReviews: [
          { id: "review-1", author: "boss", authorType: "Unknown" as const, body: "Needs rework" },
        ],
        threads: {
          actionable: [],
          resolutionOnly: [],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [],
        },
        comments: { actionable: [], firstLook: [] },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("escalate");
    if (result.action === "escalate") {
      expect(result.escalate.triggers).toContain("pr-level-changes-requested");
      expect(result.escalate.changesRequestedReviews).toHaveLength(1);
    }
  });

  it("does NOT escalate when changesRequestedReviews + resolution-only threads exist", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        changesRequestedReviews: [
          { id: "review-1", author: "boss", authorType: "Unknown" as const, body: "Needs rework" },
        ],
        threads: {
          actionable: [],
          resolutionOnly: [RESOLUTION_ONLY_THREAD],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [],
        },
        comments: { actionable: [], firstLook: [] },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code") {
      expect(result.fix.resolveCommand.argv).toContain("thread-resolution-only");
    }
  });
});

describe("runIterate — escalate (pr-level-changes-requested suppressed during CONFLICTS)", () => {
  it("does NOT escalate when changesRequestedReviews + merge CONFLICTS (fix_code handles rebase)", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        mergeStatus: {
          status: "CONFLICTS",
          state: "OPEN" as const,
          isDraft: false,
          mergeable: "CONFLICTING",
          reviewDecision: null,
          blockingBotReviewInProgress: false,
          mergeStateStatus: "DIRTY",
        },
        changesRequestedReviews: [
          { id: "review-1", author: "boss", authorType: "Unknown" as const, body: "Needs rework" },
        ],
        threads: {
          actionable: [],
          resolutionOnly: [],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [],
        },
        comments: { actionable: [], firstLook: [] },
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
});

describe("runIterate — escalate (pr-level-changes-requested with actionable comments)", () => {
  it("does NOT escalate when changesRequestedReviews + actionable comments exist", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        changesRequestedReviews: [
          { id: "review-1", author: "boss", authorType: "Unknown" as const, body: "Needs rework" },
        ],
        threads: {
          actionable: [],
          resolutionOnly: [],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [],
        },
        comments: {
          actionable: [
            {
              id: "comment-1",
              isMinimized: false,
              author: "boss",
              authorType: "Unknown" as const,
              body: "See review",
              url: "",
              createdAtUnix: NOW - 100,
            },
          ],
          firstLook: [],
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
});

// Human approval pending — cancel after ready-delay elapses

function makeBlockedReadyReport(reviewDecision: "REVIEW_REQUIRED" | "APPROVED" | null) {
  return makeReport({
    status: "READY",
    mergeStatus: {
      status: "BLOCKED",
      state: "OPEN" as const,
      isDraft: false,
      mergeable: "MERGEABLE",
      reviewDecision,
      blockingBotReviewInProgress: false,
      mergeStateStatus: "BLOCKED",
    },
  });
}

describe("runIterate — BLOCKED + clean (hand off to humans via ready-delay)", () => {
  it.each([
    ["REVIEW_REQUIRED", "REVIEW_REQUIRED" as const],
    ["APPROVED (insufficient approvals)", "APPROVED" as const],
    ["null (other branch protection)", null],
  ])(
    "reviewDecision=%s: wait during window then cancel after elapsed",
    async (_label, reviewDecision) => {
      mockRunCheck.mockResolvedValue(makeBlockedReadyReport(reviewDecision));

      mockUpdateReadyDelay.mockResolvedValue({
        isReady: true,
        shouldCancel: false,
        remainingSeconds: 300,
      });
      expect((await runIterate(makeOpts())).action).toBe("wait");

      mockUpdateReadyDelay.mockResolvedValue({
        isReady: true,
        shouldCancel: true,
        remainingSeconds: 0,
      });
      const result = await runIterate(makeOpts());
      expect(result.action).toBe("cancel");
      expect(result.shouldCancel).toBe(true);
    },
  );
});

describe("runIterate — escalate (thread-missing-location)", () => {
  it("escalates when an actionable thread has no file/line reference", async () => {
    const threadNoPath = { ...THREAD, id: "thread-noloc", path: null, line: null };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: { ...makeReport().threads, actionable: [threadNoPath] },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("escalate");
    if (result.action === "escalate") {
      expect(result.escalate.triggers).toContain("thread-missing-location");
      expect(result.escalate.suggestion).toBeTruthy();
    }
  });

  it("escalates when an actionable thread has path but null line", async () => {
    const threadNoLine = { ...THREAD, id: "thread-noline", path: "src/foo.mts", line: null };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: { ...makeReport().threads, actionable: [threadNoLine] },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("escalate");
    if (result.action === "escalate") {
      expect(result.escalate.triggers).toContain("thread-missing-location");
    }
  });
});
