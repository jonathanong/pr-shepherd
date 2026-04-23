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

vi.mock("../checks/triage.mts", () => ({
  // Pass checks through unchanged — failureKind is pre-set by test fixtures.
  triageFailingChecks: vi.fn((checks: unknown[]) => Promise.resolve(checks)),
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

import { runIterate, renderResolveCommand } from "./iterate.mts";
import { runCheck } from "./check.mts";
import { updateReadyDelay } from "./ready-delay.mts";
import { triageFailingChecks } from "../checks/triage.mts";
import { readFixAttempts, writeFixAttempts } from "../cache/fix-attempts.mts";
import { readStallState, writeStallState, type StallState } from "../cache/iterate-stall.mts";
import type { ShepherdReport, IterateCommandOptions } from "../types.mts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockRunCheck = vi.mocked(runCheck);
const mockUpdateReadyDelay = vi.mocked(updateReadyDelay);
const mockTriageFailingChecks = vi.mocked(triageFailingChecks);
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
  // Pass checks through unchanged — failureKind is pre-set by test fixtures.
  mockTriageFailingChecks.mockImplementation((checks) => Promise.resolve(checks));
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

describe("runIterate — fix_code (actionable threads)", () => {
  it("returns action: fix_code with 2 actionable threads and 0 CI failures", async () => {
    const thread1 = {
      id: "thread-1",
      isResolved: false,
      isOutdated: false,
      isMinimized: false,
      path: "src/foo.mts",
      line: 10,
      startLine: null,
      author: "reviewer",
      body: "Fix this bug",
      createdAtUnix: NOW - 3600,
    };
    const thread2 = {
      id: "thread-2",
      isResolved: false,
      isOutdated: false,
      isMinimized: false,
      path: "src/bar.mts",
      line: 20,
      startLine: null,
      author: "reviewer",
      body: "Fix this too",
      createdAtUnix: NOW - 3600,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: { actionable: [thread1, thread2], autoResolved: [], autoResolveErrors: [] },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code" && result.fix.mode === "rebase-and-push") {
      expect(result.fix.threads).toHaveLength(2);
      expect(result.fix.actionableComments).toHaveLength(0);
      expect(result.fix.noiseCommentIds).toHaveLength(0);
      expect(result.fix.checks).toHaveLength(0);
      expect(result.cancelled).toHaveLength(0);
      const joined = result.fix.instructions.join("\n");
      // push with no cancelled → stop-iteration but no no-recancel warning
      expect(joined).toContain("Stop this iteration");
      expect(joined).not.toContain("Do not re-run");
    }
  });
});

function makeActionableCheck(runId: string, name = "typecheck") {
  return {
    name,
    status: "COMPLETED" as const,
    conclusion: "FAILURE" as const,
    detailsUrl: `https://github.com/owner/repo/actions/runs/${runId}`,
    event: "pull_request",
    runId,
    category: "failing" as const,
    failureKind: "actionable" as const,
    logExcerpt: "error TS2345: type mismatch",
  };
}

describe("runIterate — fix_code (actionable CI failure)", () => {
  it("calls gh run cancel and returns action: fix_code (all succeed)", async () => {
    const actionableCheck = makeActionableCheck("run-99");
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: [],
          failing: [actionableCheck],
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
    if (result.action === "fix_code" && result.fix.mode === "rebase-and-push") {
      expect(result.fix.checks).toHaveLength(1);
      expect(result.cancelled).toEqual(["run-99"]);
      const joined = result.fix.instructions.join("\n");
      // cancelled > 0 + push → no-recancel warning present
      expect(joined).toContain("Do not re-run `gh run cancel`");
      // any push → stop-iteration instruction present
      expect(joined).toContain("Stop this iteration");
    }
    const cancelCall = (mockFetch.mock.calls as Array<[string, RequestInit]>).find(([url]) =>
      url.includes("run-99/cancel"),
    );
    expect(cancelCall).toBeDefined();
    expect(cancelCall![1].method).toBe("POST");
  });

  it("returns fix_code with partial cancelled when one gh run cancel fails", async () => {
    const check1 = makeActionableCheck("run-100", "typecheck");
    const check2 = makeActionableCheck("run-101", "lint");
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
    mockFetch.mockImplementation((url: string) => {
      if ((url as string).includes("run-100/cancel")) {
        return Promise.resolve({
          ok: false,
          status: 409,
          headers: new Headers(),
          text: () => Promise.resolve("Cannot cancel a workflow run that is completed"),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 202,
        headers: new Headers(),
        text: () => Promise.resolve(""),
      });
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code" && result.fix.mode === "rebase-and-push") {
      expect(result.fix.checks).toHaveLength(2);
      expect(result.cancelled).toEqual(["run-101"]);
    }
  });

  it("returns fix_code with empty cancelled when all gh run cancel calls fail (regression: PR #2112)", async () => {
    const actionableCheck = makeActionableCheck("run-200");
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: [],
          failing: [actionableCheck],
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
    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      headers: new Headers(),
      text: () => Promise.resolve("Cannot cancel a workflow run that is completed"),
    });

    const result = await runIterate(makeOpts());

    // The fix_code decision must survive even when cancel side-effect fails entirely.
    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code" && result.fix.mode === "rebase-and-push") {
      expect(result.fix.checks).toHaveLength(1);
      expect(result.cancelled).toEqual([]);
    }
  });

  it("silently swallows 'Cannot cancel a workflow run that is completed' — no stderr", async () => {
    const actionableCheck = makeActionableCheck("run-400");
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: [],
          failing: [actionableCheck],
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
    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      headers: new Headers(),
      text: () => Promise.resolve("Cannot cancel a workflow run that is completed"),
    });
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    try {
      const result = await runIterate(makeOpts());

      expect(result.action).toBe("fix_code");
      if (result.action === "fix_code" && result.fix.mode === "rebase-and-push") {
        expect(result.cancelled).toEqual([]);
      }
      expect(stderrSpy).not.toHaveBeenCalled();
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it("still logs stderr for unexpected gh run cancel errors", async () => {
    const actionableCheck = makeActionableCheck("run-401");
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: [],
          failing: [actionableCheck],
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
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Headers(),
      text: () => Promise.resolve("Forbidden"),
    });
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    try {
      await runIterate(makeOpts());
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining("cancel run run-401 failed (ignored)"),
      );
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it("deduplicates runIds — two checks sharing a runId emit one AgentCheck and call gh run cancel once", async () => {
    const check1 = makeActionableCheck("run-300", "typecheck");
    const check2 = makeActionableCheck("run-300", "lint");
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

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code" && result.fix.mode === "rebase-and-push") {
      // Deduped by runId — only one AgentCheck emitted.
      expect(result.fix.checks).toHaveLength(1);
      expect(result.fix.checks[0]?.runId).toBe("run-300");
      expect(result.cancelled).toEqual(["run-300"]);
    }
    const cancelCalls = (mockFetch.mock.calls as Array<[string, RequestInit]>).filter(([url]) =>
      url.includes("/cancel"),
    );
    expect(cancelCalls).toHaveLength(1);
  });
});

describe("runIterate — fix_code agent projection", () => {
  it("emits AgentThread shape — no isResolved/isOutdated/createdAtUnix on fix.threads", async () => {
    const thread = {
      id: "t-1",
      isResolved: false,
      isOutdated: false,
      isMinimized: false,
      path: "src/foo.mts",
      line: 5,
      startLine: null,
      author: "alice",
      body: "Please fix this",
      createdAtUnix: 1700000000,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: { actionable: [thread], autoResolved: [], autoResolveErrors: [] },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code" && result.fix.mode === "rebase-and-push") {
      const t = result.fix.threads[0]!;
      expect(t.id).toBe("t-1");
      expect(t.path).toBe("src/foo.mts");
      expect(t.line).toBe(5);
      expect(t.author).toBe("alice");
      expect(t.body).toBe("Please fix this");
      expect(t).not.toHaveProperty("isResolved");
      expect(t).not.toHaveProperty("isOutdated");
      expect(t).not.toHaveProperty("createdAtUnix");
    }
  });

  it("emits AgentComment shape — no isMinimized/createdAtUnix on fix.actionableComments", async () => {
    const comment = {
      id: "c-1",
      isMinimized: false,
      author: "bob",
      body: "Consider renaming this",
      createdAtUnix: 1700000000,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        comments: { actionable: [comment] },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code" && result.fix.mode === "rebase-and-push") {
      const c = result.fix.actionableComments[0]!;
      expect(c.id).toBe("c-1");
      expect(c.author).toBe("bob");
      expect(c.body).toBe("Consider renaming this");
      expect(c).not.toHaveProperty("isMinimized");
      expect(c).not.toHaveProperty("createdAtUnix");
    }
  });

  it("emits AgentCheck shape — no logExcerpt/detailsUrl/conclusion on fix.checks", async () => {
    const check = makeActionableCheck("run-55");
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: [],
          failing: [check],
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
    mockTriageFailingChecks.mockResolvedValue([
      { ...check, failureKind: "actionable", logExcerpt: "some log" },
    ]);

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code" && result.fix.mode === "rebase-and-push") {
      const c = result.fix.checks[0]!;
      expect(c.name).toBe("typecheck");
      expect(c.runId).toBe("run-55");
      expect(c.detailsUrl).toBeDefined();
      expect(c.failureKind).toBe("actionable");
      expect(c).not.toHaveProperty("logExcerpt");
      expect(c).not.toHaveProperty("conclusion");
      expect(c).not.toHaveProperty("category");
    }
  });

  it("external status check (runId=null) — instructions split by runId presence", async () => {
    const externalCheck = {
      name: "codecov/patch",
      status: "COMPLETED" as const,
      conclusion: "FAILURE" as const,
      detailsUrl: "https://app.codecov.io/...",
      event: "pull_request",
      runId: null,
      category: "failing" as const,
    };
    const ghActionsCheck = makeActionableCheck("run-77", "lint");
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: [],
          failing: [externalCheck, ghActionsCheck],
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
    mockTriageFailingChecks.mockResolvedValue([
      { ...externalCheck, failureKind: "actionable", category: "failing" as const },
      { ...ghActionsCheck, failureKind: "actionable" },
    ]);

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code" && result.fix.mode === "rebase-and-push") {
      const instructionsJoined = result.fix.instructions.join("\n");
      expect(instructionsJoined).toContain("GitHub Actions");
      expect(instructionsJoined).toContain("gh run view <runId> --log-failed");
      expect(instructionsJoined).toContain("external status check");
      expect(instructionsJoined).toContain("open the linked URL");
      // No bare-check bullets in this test, so the `(no runId)` instruction is omitted.
      expect(instructionsJoined).not.toContain("(no runId)");
    }
  });

  it("bare check (runId=null, no detailsUrl) — emits escalate-to-human instruction", async () => {
    const bareCheck = {
      name: "mystery",
      status: "COMPLETED" as const,
      conclusion: "FAILURE" as const,
      detailsUrl: "",
      event: "pull_request",
      runId: null,
      category: "failing" as const,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: [],
          failing: [bareCheck],
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
    mockTriageFailingChecks.mockResolvedValue([
      { ...bareCheck, failureKind: "actionable", category: "failing" as const },
    ]);

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code" && result.fix.mode === "rebase-and-push") {
      const instructionsJoined = result.fix.instructions.join("\n");
      expect(instructionsJoined).toContain("(no runId)");
      expect(instructionsJoined).toMatch(/escalate/i);
      // external-check instruction is gated separately and must NOT appear for a bare check.
      expect(instructionsJoined).not.toContain("external status check");
    }
  });

  it("combined runId + external + bare checks — all three instruction variants coexist", async () => {
    // Guards against a filter-predicate drift between buildFixInstructions
    // (which buckets checks by truthiness) and the CLI formatter (which emits
    // bullets by the same truthiness). If either side stops agreeing, an
    // emitted bullet shape would have no matching instruction.
    const ghActionsCheck = makeActionableCheck("run-77", "lint");
    const externalCheck = {
      name: "codecov/patch",
      status: "COMPLETED" as const,
      conclusion: "FAILURE" as const,
      detailsUrl: "https://app.codecov.io/...",
      event: "pull_request",
      runId: null,
      category: "failing" as const,
    };
    const bareCheck = {
      name: "mystery",
      status: "COMPLETED" as const,
      conclusion: "FAILURE" as const,
      detailsUrl: "",
      event: "pull_request",
      runId: null,
      category: "failing" as const,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: [],
          failing: [ghActionsCheck, externalCheck, bareCheck],
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
    mockTriageFailingChecks.mockResolvedValue([
      { ...ghActionsCheck, failureKind: "actionable" },
      { ...externalCheck, failureKind: "actionable", category: "failing" as const },
      { ...bareCheck, failureKind: "actionable", category: "failing" as const },
    ]);

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code" && result.fix.mode === "rebase-and-push") {
      expect(result.fix.checks).toHaveLength(3);
      const joined = result.fix.instructions.join("\n");
      // All three instruction variants present:
      expect(joined).toContain("numeric runId (GitHub Actions)");
      expect(joined).toContain("external status check");
      expect(joined).toContain("(no runId)");
      // And each appears exactly once:
      expect(joined.match(/GitHub Actions/g)).toHaveLength(1);
      expect(joined.match(/external status check/g)).toHaveLength(1);
      expect(joined.match(/\(no runId\)/g)).toHaveLength(1);
    }
  });
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

    // Verify rerun-failed-jobs was called for both via fetch
    const fetchUrls = (mockFetch.mock.calls as Array<[string, RequestInit]>).map(([url]) => url);
    expect(fetchUrls.some((u) => u.includes("run-10/rerun-failed-jobs"))).toBe(true);
    expect(fetchUrls.some((u) => u.includes("run-11/rerun-failed-jobs"))).toBe(true);
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
      failureKind: "infrastructure" as const,
    };
    const check2 = {
      name: "test-step-2",
      status: "COMPLETED" as const,
      conclusion: "FAILURE" as const,
      detailsUrl: "https://github.com/owner/repo/actions/runs/20",
      event: "pull_request",
      runId: "run-20", // same runId
      category: "failing" as const,
      failureKind: "infrastructure" as const,
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
      expect(result.reran[0].failureKind).toBe("infrastructure");
    }
  });
});

describe("runIterate — rebase", () => {
  it("returns action: rebase when flaky failure + BEHIND", async () => {
    const flakyCheck = {
      name: "flaky-test",
      status: "COMPLETED" as const,
      conclusion: "FAILURE" as const,
      detailsUrl: "https://github.com/owner/repo/actions/runs/30",
      event: "pull_request",
      runId: "run-30",
      category: "failing" as const,
      failureKind: "flaky" as const,
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
    expect(result.mergeStateStatus).toBe("BEHIND");
  });
});

describe("runIterate — fix_code (merge conflicts)", () => {
  it("returns action: fix_code when mergeStatus is CONFLICTS (rebase happens in fix_code handler)", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        mergeStatus: {
          status: "CONFLICTS",
          state: "OPEN" as const,
          isDraft: false,
          mergeable: "CONFLICTING",
          reviewDecision: null,
          copilotReviewInProgress: false,
          mergeStateStatus: "DIRTY",
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
    if (result.action === "fix_code" && result.fix.mode === "rebase-and-push") {
      expect(result.fix.threads).toHaveLength(0);
      expect(result.fix.checks).toHaveLength(0);
      // CONFLICTS-only: no commit step (nothing to commit), but we still
      // emit a rebase-with-conflict-resolution instruction and no resolve step.
      const joined = result.fix.instructions.join("\n");
      expect(joined).not.toContain("git commit");
      expect(joined).not.toContain("gh pr edit");
      expect(joined).toContain("Rebase with conflict resolution");
      expect(joined).toContain("git rebase --continue");
      expect(joined).toContain("git push --force-with-lease");
      expect(joined).not.toContain("resolve:");
    }
  });

  it("returns fix_code with threads when CONFLICTS + actionable comments exist (one push)", async () => {
    const thread = {
      id: "thread-1",
      isResolved: false,
      isOutdated: false,
      isMinimized: false,
      path: "src/foo.mts",
      line: 10,
      startLine: null,
      author: "reviewer",
      body: "Fix this",
      createdAtUnix: 1700000000,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        mergeStatus: {
          status: "CONFLICTS",
          state: "OPEN" as const,
          isDraft: false,
          mergeable: "CONFLICTING",
          reviewDecision: null,
          copilotReviewInProgress: false,
          mergeStateStatus: "DIRTY",
        },
        threads: { actionable: [thread], autoResolved: [], autoResolveErrors: [] },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code" && result.fix.mode === "rebase-and-push") {
      expect(result.fix.threads).toHaveLength(1);
      expect(result.fix.threads[0]?.id).toBe("thread-1");
      // Threads + CONFLICTS: commit step, rebase-with-conflict-resolution (not
      // the clean `&& git push` one-liner), and resolve step all present.
      const joined = result.fix.instructions.join("\n");
      expect(joined).toContain("git commit");
      expect(joined).toContain("gh pr edit");
      expect(joined).toContain("Rebase with conflict resolution");
      expect(joined).toContain("git rebase --continue");
      expect(joined).not.toMatch(/rebase origin\/\w+ && git push/);
      expect(joined).toContain("resolve:");
    }
  });
});

describe("runIterate — mark_ready", () => {
  it("calls gh pr ready and returns action: mark_ready for READY + CLEAN + isDraft", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "READY",
        mergeStatus: {
          status: "CLEAN",
          state: "OPEN" as const,
          isDraft: true,
          mergeable: "MERGEABLE",
          reviewDecision: "APPROVED",
          copilotReviewInProgress: false,
          mergeStateStatus: "CLEAN",
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: false,
      remainingSeconds: 300,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("mark_ready");
    if (result.action === "mark_ready") {
      expect(result.markedReady).toBe(true);
    }

    // markPullRequestReadyForReview is a GraphQL mutation — verify a /graphql fetch was made
    const graphqlCalls = (mockFetch.mock.calls as Array<[string, RequestInit]>).filter(([url]) =>
      url.endsWith("/graphql"),
    );
    expect(graphqlCalls).toHaveLength(1);
  });

  it("does NOT mark ready when copilotReviewInProgress", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "READY",
        mergeStatus: {
          status: "CLEAN",
          state: "OPEN" as const,
          isDraft: true,
          mergeable: "MERGEABLE",
          reviewDecision: "APPROVED",
          copilotReviewInProgress: true,
          mergeStateStatus: "CLEAN",
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: false,
      remainingSeconds: 300,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("wait");
    const graphqlCalls = (mockFetch.mock.calls as Array<[string, RequestInit]>).filter(([url]) =>
      url.endsWith("/graphql"),
    );
    expect(graphqlCalls).toHaveLength(0);
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

describe("runIterate — deferred triage", () => {
  it("skips triage when PR is MERGED and checks are failing", async () => {
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
        checks: {
          passing: [],
          failing: [
            {
              name: "ci",
              status: "COMPLETED",
              conclusion: "FAILURE",
              detailsUrl: "https://github.com/owner/repo/actions/runs/1",
              event: "pull_request",
              runId: "run-1",
              category: "failing",
            },
          ],
          inProgress: [],
          skipped: [],
          filtered: [],
          filteredNames: [],
          blockedByFilteredCheck: false,
        },
      }),
    );

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("cancel");
    expect(mockTriageFailingChecks).not.toHaveBeenCalled();
  });

  it("runs triage for CONFLICTS + failing checks, returns fix_code", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        mergeStatus: {
          status: "CONFLICTS",
          state: "OPEN",
          isDraft: false,
          mergeable: "CONFLICTING",
          reviewDecision: null,
          copilotReviewInProgress: false,
          mergeStateStatus: "DIRTY",
        },
        checks: {
          passing: [],
          failing: [
            {
              name: "ci",
              status: "COMPLETED",
              conclusion: "FAILURE",
              detailsUrl: "https://github.com/owner/repo/actions/runs/2",
              event: "pull_request",
              runId: "run-2",
              category: "failing",
            },
          ],
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

    // Triage runs before the CONFLICTS/actionable check now.
    expect(mockTriageFailingChecks).toHaveBeenCalledOnce();
    // CONFLICTS is actionable — fix_code handler does the rebase.
    expect(result.action).toBe("fix_code");
  });

  it("calls triage for OPEN PR with failing checks and surfaces actionable failureKind in fix payload", async () => {
    const failingCheck = {
      name: "typecheck",
      status: "COMPLETED" as const,
      conclusion: "FAILURE" as const,
      detailsUrl: "https://github.com/owner/repo/actions/runs/3",
      event: "pull_request",
      runId: "run-3",
      category: "failing" as const,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: [],
          failing: [failingCheck],
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
    // Mock triage to return check with failureKind: 'actionable'
    mockTriageFailingChecks.mockResolvedValue([
      { ...failingCheck, failureKind: "actionable", logExcerpt: "error TS2345: type mismatch" },
    ]);

    const result = await runIterate(makeOpts());

    expect(mockTriageFailingChecks).toHaveBeenCalledOnce();
    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code" && result.fix.mode === "rebase-and-push") {
      expect(result.fix.checks).toHaveLength(1);
      expect(result.fix.checks[0]?.failureKind).toBe("actionable");
    }
  });
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
  body: "Fix this",
  createdAtUnix: NOW - 3600,
};

describe("runIterate — escalate (fix-thrash)", () => {
  it("escalates when a thread has been attempted >= maxFixAttempts times", async () => {
    mockReadFixAttempts.mockResolvedValue({ headSha: "abc123", threadAttempts: { "thread-1": 3 } });
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: { actionable: [THREAD], autoResolved: [], autoResolveErrors: [] },
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
      expect(result.escalate.attemptHistory).toHaveLength(1);
      expect(result.escalate.attemptHistory?.[0]?.threadId).toBe("thread-1");
      expect(result.escalate.attemptHistory?.[0]?.attempts).toBe(3);
    }
  });

  it("does NOT escalate when attempt count is below threshold (attempt=2)", async () => {
    mockReadFixAttempts.mockResolvedValue({ headSha: "abc123", threadAttempts: { "thread-1": 2 } });
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: { actionable: [THREAD], autoResolved: [], autoResolveErrors: [] },
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

  it("resets attempt counts when HEAD SHA changes and does NOT escalate", async () => {
    // Stored state has SHA 'old-sha' with 5 attempts — should be discarded.
    mockReadFixAttempts.mockResolvedValue({
      headSha: "old-sha",
      threadAttempts: { "thread-1": 5 },
    });
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: { actionable: [THREAD], autoResolved: [], autoResolveErrors: [] },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    // Old SHA 'old-sha' ≠ current 'abc123' → counts reset → no escalation.
    expect(result.action).toBe("fix_code");
  });

  it("increments attempt count and calls writeFixAttempts on fix_code dispatch", async () => {
    mockReadFixAttempts.mockResolvedValue({ headSha: "abc123", threadAttempts: { "thread-1": 1 } });
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: { actionable: [THREAD], autoResolved: [], autoResolveErrors: [] },
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

describe("runIterate — escalate (pr-level-changes-requested)", () => {
  it("escalates when changesRequestedReviews with no inline threads or CI failures", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        changesRequestedReviews: [{ id: "review-1", author: "boss", body: "Needs rework" }],
        threads: { actionable: [], autoResolved: [], autoResolveErrors: [] },
        comments: { actionable: [] },
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
          copilotReviewInProgress: false,
          mergeStateStatus: "DIRTY",
        },
        changesRequestedReviews: [{ id: "review-1", author: "boss", body: "Needs rework" }],
        threads: { actionable: [], autoResolved: [], autoResolveErrors: [] },
        comments: { actionable: [] },
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
        changesRequestedReviews: [{ id: "review-1", author: "boss", body: "Needs rework" }],
        threads: { actionable: [], autoResolved: [], autoResolveErrors: [] },
        comments: {
          actionable: [
            {
              id: "comment-1",
              isMinimized: false,
              author: "boss",
              body: "See review",
              createdAtUnix: NOW - 100,
            },
          ],
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

// ---------------------------------------------------------------------------
// Human approval pending — cancel after ready-delay elapses
// ---------------------------------------------------------------------------

describe("runIterate — human approval pending (BLOCKED + REVIEW_REQUIRED)", () => {
  const blockedApprovalReport = makeReport({
    status: "READY",
    mergeStatus: {
      status: "BLOCKED",
      state: "OPEN" as const,
      isDraft: false,
      mergeable: "MERGEABLE",
      reviewDecision: "REVIEW_REQUIRED",
      copilotReviewInProgress: false,
      mergeStateStatus: "BLOCKED",
    },
  });

  it("returns action: wait during the ready-delay window", async () => {
    mockRunCheck.mockResolvedValue(blockedApprovalReport);
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: false,
      remainingSeconds: 300,
    });

    const result = await runIterate(makeOpts());
    expect(result.action).toBe("wait");
  });

  it("returns action: cancel when ready-delay has elapsed", async () => {
    mockRunCheck.mockResolvedValue(blockedApprovalReport);
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });

    const result = await runIterate(makeOpts());
    expect(result.action).toBe("cancel");
    expect(result.shouldCancel).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Prescriptive fields
// ---------------------------------------------------------------------------

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

  it("cancel.log mentions PR state when PR is merged", async () => {
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
      expect(result.log).toMatch(/CANCEL/);
      expect(result.log).toMatch(/merged/i);
    }
  });

  it("cancel.log mentions ready-delay when shouldCancel from ready-delay", async () => {
    mockRunCheck.mockResolvedValue(makeReport());
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });

    const result = await runIterate(makeOpts());
    expect(result.action).toBe("cancel");
    if (result.action === "cancel") {
      expect(result.log).toMatch(/CANCEL/);
      expect(result.log).toMatch(/ready/i);
    }
  });

  it("rerun_ci.log includes count and run IDs", async () => {
    const timeoutCheck = {
      name: "test",
      status: "COMPLETED" as const,
      conclusion: "TIMED_OUT" as const,
      detailsUrl: "https://github.com/owner/repo/actions/runs/99",
      event: "pull_request",
      runId: "run-99",
      category: "failing" as const,
      failureKind: "timeout" as const,
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
    expect(result.action).toBe("rerun_ci");
    if (result.action === "rerun_ci") {
      expect(result.log).toMatch(/RERAN/);
      expect(result.log).toMatch(/run-99/);
      expect(result.log).toMatch(/test/);
      expect(result.log).toMatch(/timeout/);
    }
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

describe("runIterate — prescriptive fields: rebase", () => {
  it("rebase result includes baseBranch, reason, and shellScript with dirty-worktree guard", async () => {
    const flakyCheck = {
      name: "flaky",
      status: "COMPLETED" as const,
      conclusion: "FAILURE" as const,
      detailsUrl: "https://github.com/owner/repo/actions/runs/30",
      event: "pull_request",
      runId: "run-30",
      category: "failing" as const,
      failureKind: "flaky" as const,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        mergeStatus: {
          status: "BEHIND",
          state: "OPEN",
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
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "log")
        return Promise.resolve({ stdout: String(NOW - 60), stderr: "" });
      if (cmd === "git" && args[0] === "rev-parse")
        return Promise.resolve({ stdout: "abc123\n", stderr: "" });
      if (cmd === "gh" && args[1] === "view")
        return Promise.resolve({ stdout: "main\n", stderr: "" });
      return Promise.resolve({ stdout: "", stderr: "" });
    });

    const result = await runIterate(makeOpts());
    expect(result.action).toBe("rebase");
    if (result.action === "rebase") {
      expect(result.baseBranch).toBe("main");
      expect(result.rebase.reason).toMatch(/behind main/i);
      expect(result.rebase.shellScript).toMatch(/git diff --quiet/);
      expect(result.rebase.shellScript).toMatch(/git rebase origin\/main/);
      expect(result.rebase.shellScript).toMatch(/--force-with-lease/);
    }
  });
});

describe("runIterate — prescriptive fields: fix_code noise/actionable split", () => {
  it("classifies quota-warning comment as noise, real review comment as actionable", async () => {
    const noiseComment = {
      id: "c-noise",
      isMinimized: false,
      author: "bot",
      body: "You have reached your daily quota",
      createdAtUnix: NOW,
    };
    const realComment = {
      id: "c-real",
      isMinimized: false,
      author: "reviewer",
      body: "Please add a null check here before calling .value()",
      createdAtUnix: NOW,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        comments: { actionable: [noiseComment, realComment] },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "log")
        return Promise.resolve({ stdout: String(NOW - 60), stderr: "" });
      if (cmd === "git" && args[0] === "rev-parse")
        return Promise.resolve({ stdout: "abc123\n", stderr: "" });
      if (cmd === "gh" && args[1] === "view")
        return Promise.resolve({ stdout: "main\n", stderr: "" });
      return Promise.resolve({ stdout: "", stderr: "" });
    });

    const result = await runIterate(makeOpts());
    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code" && result.fix.mode === "rebase-and-push") {
      expect(result.fix.actionableComments).toHaveLength(1);
      expect(result.fix.actionableComments[0]!.id).toBe("c-real");
      expect(result.fix.noiseCommentIds).toEqual(["c-noise"]);
    }
  });

  it("classifies rate-limit noise across em-dash, ASCII hyphen, and colon variants", async () => {
    const emDash = {
      id: "c-em",
      isMinimized: false,
      author: "bot",
      body: "rate-limited — try again later",
      createdAtUnix: NOW,
    };
    const asciiHyphen = {
      id: "c-hy",
      isMinimized: false,
      author: "bot",
      body: "rate-limited - try again in a few minutes",
      createdAtUnix: NOW,
    };
    const colon = {
      id: "c-co",
      isMinimized: false,
      author: "bot",
      body: "rate limited: try again later",
      createdAtUnix: NOW,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        comments: { actionable: [emDash, asciiHyphen, colon] },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "gh" && args[1] === "view")
        return Promise.resolve({ stdout: "main\n", stderr: "" });
      return Promise.resolve({ stdout: "", stderr: "" });
    });

    const result = await runIterate(makeOpts());
    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code" && result.fix.mode === "rebase-and-push") {
      expect(result.fix.noiseCommentIds.sort()).toEqual(["c-co", "c-em", "c-hy"]);
      expect(result.fix.actionableComments).toHaveLength(0);
    }
  });

  it("resolveCommand includes thread IDs and comment IDs with $HEAD_SHA flag", async () => {
    const thread = { ...THREAD };
    const comment = {
      id: "c-1",
      isMinimized: false,
      author: "reviewer",
      body: "Fix the types here",
      createdAtUnix: NOW,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: { actionable: [thread], autoResolved: [], autoResolveErrors: [] },
        comments: { actionable: [comment] },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "log")
        return Promise.resolve({ stdout: String(NOW - 60), stderr: "" });
      if (cmd === "git" && args[0] === "rev-parse")
        return Promise.resolve({ stdout: "abc123\n", stderr: "" });
      if (cmd === "gh" && args[1] === "view")
        return Promise.resolve({ stdout: "main\n", stderr: "" });
      return Promise.resolve({ stdout: "", stderr: "" });
    });

    const result = await runIterate(makeOpts());
    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code" && result.fix.mode === "rebase-and-push") {
      const { resolveCommand } = result.fix;
      expect(resolveCommand.argv).toContain("--resolve-thread-ids");
      expect(resolveCommand.argv.join(" ")).toContain("thread-1");
      expect(resolveCommand.argv).toContain("--minimize-comment-ids");
      expect(resolveCommand.argv.join(" ")).toContain("c-1");
      expect(resolveCommand.requiresHeadSha).toBe(true);
      expect(resolveCommand.requiresDismissMessage).toBe(false);
    }
  });

  it("resolveCommand includes dismiss-review-ids and $DISMISS_MESSAGE when changesRequested", async () => {
    const review = { id: "r-1", author: "reviewer", body: "Please address the naming" };
    const thread = { ...THREAD };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: { actionable: [thread], autoResolved: [], autoResolveErrors: [] },
        changesRequestedReviews: [review],
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "log")
        return Promise.resolve({ stdout: String(NOW - 60), stderr: "" });
      if (cmd === "git" && args[0] === "rev-parse")
        return Promise.resolve({ stdout: "abc123\n", stderr: "" });
      if (cmd === "gh" && args[1] === "view")
        return Promise.resolve({ stdout: "main\n", stderr: "" });
      return Promise.resolve({ stdout: "", stderr: "" });
    });

    const result = await runIterate(makeOpts());
    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code" && result.fix.mode === "rebase-and-push") {
      const { resolveCommand } = result.fix;
      expect(resolveCommand.argv).toContain("--dismiss-review-ids");
      expect(resolveCommand.argv.join(" ")).toContain("r-1");
      expect(resolveCommand.argv).toContain("$DISMISS_MESSAGE");
      expect(resolveCommand.requiresDismissMessage).toBe(true);
    }
  });
});

describe("runIterate — prescriptive fields: escalate humanMessage", () => {
  it("escalate.humanMessage contains triggers, suggestion, and thread details", async () => {
    mockReadFixAttempts.mockResolvedValue({ headSha: "abc123", threadAttempts: { "thread-1": 3 } });
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: { actionable: [THREAD], autoResolved: [], autoResolveErrors: [] },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "log")
        return Promise.resolve({ stdout: String(NOW - 60), stderr: "" });
      if (cmd === "git" && args[0] === "rev-parse")
        return Promise.resolve({ stdout: "abc123\n", stderr: "" });
      return Promise.resolve({ stdout: "", stderr: "" });
    });

    const result = await runIterate(makeOpts());
    expect(result.action).toBe("escalate");
    if (result.action === "escalate") {
      const { humanMessage } = result.escalate;
      expect(humanMessage).toMatch(/paused/i);
      expect(humanMessage).toMatch(/fix-thrash/);
      expect(humanMessage).toMatch(/thread-1/);
      expect(humanMessage).toMatch(/src\/foo\.mts/);
      expect(humanMessage).toMatch(/pr-shepherd:check 42/);
      expect(humanMessage).toMatch(/pr-shepherd:monitor 42` to resume/);
    }
  });

  it("escalates with base-branch-unknown when fix_code needs a push but baseBranch is empty", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        baseBranch: "",
        threads: { actionable: [THREAD], autoResolved: [], autoResolveErrors: [] },
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
      expect(result.escalate.triggers).toContain("base-branch-unknown");
      expect(result.escalate.suggestion).toMatch(/empty base branch name/);
      expect(result.escalate.humanMessage).toMatch(/base-branch-unknown/);
    }
  });

  it("escalates with base-branch-unknown when rebase would run but baseBranch is empty", async () => {
    const flakyCheck = {
      name: "flaky",
      status: "COMPLETED" as const,
      conclusion: "FAILURE" as const,
      detailsUrl: "https://github.com/owner/repo/actions/runs/30",
      event: "pull_request",
      runId: "run-30",
      category: "failing" as const,
      failureKind: "flaky" as const,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        baseBranch: "",
        mergeStatus: {
          status: "BEHIND",
          state: "OPEN",
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
    expect(result.action).toBe("escalate");
    if (result.action === "escalate") {
      expect(result.escalate.triggers).toEqual(["base-branch-unknown"]);
    }
  });

  it("escalates with base-branch-unknown on CONFLICTS-only when baseBranch is empty (no resolve IDs, but rebase still needed)", async () => {
    // Guards the `|| hasConflicts` branch of the fix_code base-branch-unknown
    // gate. Without it, a CONFLICTS-only PR with no threads/comments/checks/
    // reviews would silently rebase onto `main` when the base branch was
    // invalid, because resolveCommand.requiresHeadSha is false (nothing to
    // resolve).
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        baseBranch: "",
        mergeStatus: {
          status: "CONFLICTS",
          state: "OPEN" as const,
          isDraft: false,
          mergeable: "CONFLICTING",
          reviewDecision: null,
          copilotReviewInProgress: false,
          mergeStateStatus: "DIRTY",
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
      expect(result.escalate.triggers).toEqual(["base-branch-unknown"]);
      expect(result.escalate.suggestion).toMatch(/empty base branch name/);
    }
  });

  it("escalates with base-branch-unknown when baseBranch contains unsafe characters", async () => {
    // Prevents shell interpolation via validateBaseBranch — a ref like
    // `main;rm -rf /` must not flow into buildRebaseShellScript.
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        baseBranch: "main; rm -rf /",
        threads: { actionable: [THREAD], autoResolved: [], autoResolveErrors: [] },
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
      expect(result.escalate.triggers).toContain("base-branch-unknown");
      expect(result.escalate.suggestion).toMatch(/unsafe characters/);
      expect(result.escalate.suggestion).toContain("main; rm -rf /");
    }
  });
});

describe("renderResolveCommand", () => {
  it("quotes $DISMISS_MESSAGE so a substituted sentence stays one argument", () => {
    const joined = renderResolveCommand({
      argv: [
        "npx",
        "pr-shepherd",
        "resolve",
        "42",
        "--dismiss-review-ids",
        "r-1",
        "--message",
        "$DISMISS_MESSAGE",
      ],
      requiresHeadSha: false,
      requiresDismissMessage: true,
      hasMutations: true,
    });
    expect(joined).toBe(
      'npx pr-shepherd resolve 42 --dismiss-review-ids r-1 --message "$DISMISS_MESSAGE"',
    );
  });

  it('appends --require-sha "$HEAD_SHA" when requiresHeadSha is true', () => {
    const joined = renderResolveCommand({
      argv: ["npx", "pr-shepherd", "resolve", "42", "--resolve-thread-ids", "t-1"],
      requiresHeadSha: true,
      requiresDismissMessage: false,
      hasMutations: true,
    });
    expect(joined).toBe(
      'npx pr-shepherd resolve 42 --resolve-thread-ids t-1 --require-sha "$HEAD_SHA"',
    );
  });

  it("omits --require-sha when requiresHeadSha is false (noise-only path)", () => {
    const joined = renderResolveCommand({
      argv: ["npx", "pr-shepherd", "resolve", "42", "--minimize-comment-ids", "c-noise"],
      requiresHeadSha: false,
      requiresDismissMessage: false,
      hasMutations: true,
    });
    expect(joined).toBe("npx pr-shepherd resolve 42 --minimize-comment-ids c-noise");
  });

  it("quotes whitespace-bearing args defensively", () => {
    const joined = renderResolveCommand({
      argv: ["npx", "pr-shepherd", "resolve", "42", "--message", "hello world"],
      requiresHeadSha: false,
      requiresDismissMessage: false,
      hasMutations: false,
    });
    expect(joined).toBe('npx pr-shepherd resolve 42 --message "hello world"');
  });

  it("leaves thread-IDs, flag names, and plain alphanumeric args unquoted", () => {
    const joined = renderResolveCommand({
      argv: [
        "npx",
        "pr-shepherd",
        "resolve",
        "42",
        "--resolve-thread-ids",
        "PRRT_kwDOSGizTs58XpO6,PRRT_kwDOSGizTs58XpPD",
        "--minimize-comment-ids",
        "c-1,c-2",
      ],
      requiresHeadSha: false,
      requiresDismissMessage: false,
      hasMutations: true,
    });
    expect(joined).not.toMatch(/"/);
    expect(joined).toBe(
      "npx pr-shepherd resolve 42 --resolve-thread-ids PRRT_kwDOSGizTs58XpO6,PRRT_kwDOSGizTs58XpPD --minimize-comment-ids c-1,c-2",
    );
  });

  it('emits placeholders as exactly `"$PLACEHOLDER"` so callers replace the whole token', () => {
    const joined = renderResolveCommand({
      argv: [
        "npx",
        "pr-shepherd",
        "resolve",
        "42",
        "--dismiss-review-ids",
        "r-1",
        "--message",
        "$DISMISS_MESSAGE",
      ],
      requiresHeadSha: true,
      requiresDismissMessage: true,
      hasMutations: true,
    });
    // Both placeholders appear with their quotes attached as a single token —
    // this is the contract consumers rely on when doing literal-text substitution.
    expect(joined).toContain('"$DISMISS_MESSAGE"');
    expect(joined).toContain('"$HEAD_SHA"');
    expect(joined.endsWith('--require-sha "$HEAD_SHA"')).toBe(true);
  });

  it("never emits an unquoted $HEAD_SHA (regardless of requiresHeadSha)", () => {
    const withSha = renderResolveCommand({
      argv: ["npx", "pr-shepherd", "resolve", "42"],
      requiresHeadSha: true,
      requiresDismissMessage: false,
      hasMutations: false,
    });
    const withoutSha = renderResolveCommand({
      argv: ["npx", "pr-shepherd", "resolve", "42"],
      requiresHeadSha: false,
      requiresDismissMessage: false,
      hasMutations: false,
    });
    // Whenever $HEAD_SHA appears it is always quoted.
    expect(withSha).not.toMatch(/(?<!")\$HEAD_SHA(?!")/);
    expect(withoutSha).not.toContain("$HEAD_SHA");
  });

  it("never emits a backtick (would break the Markdown `resolve:` fence)", () => {
    // Rendered output is embedded inside a backtick-delimited inline span in
    // the Markdown emitter (cli.mts). An unescaped backtick here would close
    // the fence early and corrupt the rest of the line for downstream parsers.
    const rendered = renderResolveCommand({
      argv: [
        "npx",
        "pr-shepherd",
        "resolve",
        "42",
        "--resolve-thread-ids",
        "PRRT_kwDOSGizTs58XpO6",
        "--minimize-comment-ids",
        "c-1,c-2",
        "--dismiss-review-ids",
        "REV_1",
        "--message",
        "$DISMISS_MESSAGE",
      ],
      requiresHeadSha: true,
      requiresDismissMessage: true,
      hasMutations: true,
    });
    expect(rendered).not.toContain("`");
  });
});

describe("buildResolveCommand (via runIterate) — argv shape invariants", () => {
  it("never puts $HEAD_SHA or --require-sha into argv (they're appended by renderResolveCommand)", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: {
          actionable: [
            {
              id: "t-1",
              isResolved: false,
              isOutdated: false,
              isMinimized: false,
              path: "src/foo.mts",
              line: 10,
              startLine: null,
              author: "reviewer",
              body: "fix me",
              createdAtUnix: NOW - 3600,
            },
          ],
          autoResolved: [],
          autoResolveErrors: [],
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
    if (result.action === "fix_code" && result.fix.mode === "rebase-and-push") {
      expect(result.fix.resolveCommand.argv).not.toContain("$HEAD_SHA");
      expect(result.fix.resolveCommand.argv).not.toContain("--require-sha");
      expect(result.fix.resolveCommand.requiresHeadSha).toBe(true);
    }
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

describe("runIterate — escalate (thread-missing-location)", () => {
  it("escalates when an actionable thread has no file/line reference", async () => {
    const threadNoPath = { ...THREAD, id: "thread-noloc", path: null, line: null };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: { actionable: [threadNoPath], autoResolved: [], autoResolveErrors: [] },
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
        threads: { actionable: [threadNoLine], autoResolved: [], autoResolveErrors: [] },
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

// ---------------------------------------------------------------------------
// runIterate — stall-timeout guard
// ---------------------------------------------------------------------------

describe("runIterate — stall-timeout guard", () => {
  const STALL_TIMEOUT_S = 1800; // 30 minutes

  function makeOpts30mStall(overrides: Partial<IterateCommandOptions> = {}): IterateCommandOptions {
    return makeOpts({ stallTimeoutSeconds: STALL_TIMEOUT_S, noAutoMarkReady: true, ...overrides });
  }

  it("writes stall state on first call (no stored state)", async () => {
    mockRunCheck.mockResolvedValue(makeReport());
    mockReadStallState.mockResolvedValue(null);

    const result = await runIterate(makeOpts30mStall());

    expect(result.action).toBe("wait");
    expect(mockWriteStallState).toHaveBeenCalledOnce();
    const written = mockWriteStallState.mock.calls[0]![1] as StallState;
    expect(written.firstSeenAt).toBe(Math.floor(NOW));
    expect(typeof written.fingerprint).toBe("string");
  });

  it("preserves firstSeenAt when fingerprint matches and threshold not yet met", async () => {
    mockRunCheck.mockResolvedValue(makeReport());
    const firstSeenAt = NOW - 60; // only 60s ago — well under 1800s
    mockReadStallState.mockResolvedValue({ fingerprint: "will-be-overridden", firstSeenAt });

    // First call: writes the real fingerprint with NOW as firstSeenAt (since stored fingerprint
    // won't match the computed one — null firstSeenAt means fresh state).
    // Simulate a matching fingerprint by running once to get the real fingerprint:
    mockReadStallState.mockResolvedValue(null);
    await runIterate(makeOpts30mStall());
    const realFingerprint = (mockWriteStallState.mock.calls[0]![1] as StallState).fingerprint;

    // Second call: stored state has the real fingerprint but only 60s old.
    mockWriteStallState.mockClear();
    mockReadStallState.mockResolvedValue({ fingerprint: realFingerprint, firstSeenAt });

    const result = await runIterate(makeOpts30mStall());

    expect(result.action).toBe("wait");
    // writeStallState should NOT be called — we preserve firstSeenAt when within threshold.
    expect(mockWriteStallState).not.toHaveBeenCalled();
  });

  it("escalates with stall-timeout when threshold exceeded", async () => {
    mockRunCheck.mockResolvedValue(makeReport());

    // Get the real fingerprint first.
    mockReadStallState.mockResolvedValue(null);
    await runIterate(makeOpts30mStall());
    const realFingerprint = (mockWriteStallState.mock.calls[0]![1] as StallState).fingerprint;

    // Second call: fingerprint matches but firstSeenAt is 1800s ago (exactly at threshold).
    mockWriteStallState.mockClear();
    const firstSeenAt = NOW - STALL_TIMEOUT_S;
    mockReadStallState.mockResolvedValue({ fingerprint: realFingerprint, firstSeenAt });

    const result = await runIterate(makeOpts30mStall());

    expect(result.action).toBe("escalate");
    if (result.action !== "escalate") return;
    expect(result.escalate.triggers).toContain("stall-timeout");
    expect(result.escalate.suggestion).toMatch(/30 minutes/);
  });

  it("resets firstSeenAt when fingerprint changes (different failing checks)", async () => {
    // First call: passing report.
    mockRunCheck.mockResolvedValue(makeReport());
    mockReadStallState.mockResolvedValue(null);
    await runIterate(makeOpts30mStall());
    const fp1 = (mockWriteStallState.mock.calls[0]![1] as StallState).fingerprint;

    // Second call: report changes (different check names).
    mockWriteStallState.mockClear();
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: [],
          failing: [
            {
              name: "unit-tests",
              status: "COMPLETED",
              conclusion: "FAILURE",
              detailsUrl: "https://github.com/owner/repo/actions/runs/99",
              event: "pull_request",
              runId: "run-99",
              category: "failing",
              failureKind: "actionable",
            },
          ],
          inProgress: [],
          skipped: [],
          filtered: [],
          filteredNames: [],
          blockedByFilteredCheck: false,
        },
      }),
    );
    // Stored state has the old fingerprint.
    mockReadStallState.mockResolvedValue({ fingerprint: fp1, firstSeenAt: NOW - STALL_TIMEOUT_S });

    const result = await runIterate(makeOpts30mStall());

    // Different fingerprint → no escalate; stall state is reset with new firstSeenAt.
    expect(result.action).not.toBe("escalate");
    expect(mockWriteStallState).toHaveBeenCalledOnce();
    const written = mockWriteStallState.mock.calls[0]![1] as StallState;
    expect(written.firstSeenAt).toBe(NOW);
    expect(written.fingerprint).not.toBe(fp1);
  });

  it("resets firstSeenAt when HEAD SHA changes", async () => {
    mockRunCheck.mockResolvedValue(makeReport());
    // First call with sha abc123.
    mockReadStallState.mockResolvedValue(null);
    await runIterate(makeOpts30mStall());
    const fp1 = (mockWriteStallState.mock.calls[0]![1] as StallState).fingerprint;

    // Second call: HEAD SHA changes to def456.
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "log") {
        return Promise.resolve({ stdout: String(NOW - 60), stderr: "" });
      }
      if (cmd === "git" && args[0] === "rev-parse") {
        return Promise.resolve({ stdout: "def456", stderr: "" });
      }
      return Promise.resolve({ stdout: "", stderr: "" });
    });
    mockWriteStallState.mockClear();
    mockReadStallState.mockResolvedValue({ fingerprint: fp1, firstSeenAt: NOW - STALL_TIMEOUT_S });

    const result = await runIterate(makeOpts30mStall());

    expect(result.action).not.toBe("escalate");
    const written = mockWriteStallState.mock.calls[0]![1] as StallState;
    expect(written.fingerprint).not.toBe(fp1); // headSha changed → fingerprint changed
    expect(written.firstSeenAt).toBe(NOW);
  });

  it("does not touch stall state on cooldown (pre-sweep early return)", async () => {
    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "log") {
        return Promise.resolve({ stdout: String(NOW - 5), stderr: "" });
      }
      return Promise.resolve({ stdout: "", stderr: "" });
    });

    const result = await runIterate(makeOpts30mStall({ cooldownSeconds: 30 }));

    expect(result.action).toBe("cooldown");
    expect(mockWriteStallState).not.toHaveBeenCalled();
    expect(mockReadStallState).not.toHaveBeenCalled();
  });

  it("does not touch stall state on cancel (ready-delay elapsed)", async () => {
    mockRunCheck.mockResolvedValue(makeReport());
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });

    const result = await runIterate(makeOpts30mStall({ stallTimeoutSeconds: STALL_TIMEOUT_S }));

    expect(result.action).toBe("cancel");
    expect(mockWriteStallState).not.toHaveBeenCalled();
  });

  it("resets firstSeenAt when inProgress check names change (exercises inProgress fingerprint path)", async () => {
    const inProgressCheck: import("../types.mts").ClassifiedCheck = {
      name: "ci-slow",
      status: "IN_PROGRESS",
      conclusion: null,
      detailsUrl: "https://github.com/owner/repo/actions/runs/1",
      event: "pull_request",
      runId: "run-1",
      category: "in_progress",
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        checks: {
          passing: [],
          failing: [],
          inProgress: [inProgressCheck],
          skipped: [],
          filtered: [],
          filteredNames: [],
          blockedByFilteredCheck: false,
        },
      }),
    );
    mockReadStallState.mockResolvedValue(null);
    await runIterate(makeOpts30mStall());
    const fp1 = (mockWriteStallState.mock.calls[0]![1] as StallState).fingerprint;
    expect(fp1).toContain("inProgress:ci-slow");

    // Second call: inProgress is now empty (job completed) → fingerprint changes.
    mockWriteStallState.mockClear();
    mockRunCheck.mockResolvedValue(makeReport());
    mockReadStallState.mockResolvedValue({ fingerprint: fp1, firstSeenAt: NOW - STALL_TIMEOUT_S });

    const result = await runIterate(makeOpts30mStall());

    expect(result.action).not.toBe("escalate");
    expect(mockWriteStallState).toHaveBeenCalledOnce();
    const written = mockWriteStallState.mock.calls[0]![1] as StallState;
    expect(written.fingerprint).not.toBe(fp1);
  });

  it("respects stallTimeoutSeconds: 0 as never-stall and refreshes firstSeenAt", async () => {
    mockRunCheck.mockResolvedValue(makeReport());
    // First call to capture real fingerprint.
    mockReadStallState.mockResolvedValue(null);
    await runIterate(makeOpts30mStall({ stallTimeoutSeconds: 0 }));
    const realFp = (mockWriteStallState.mock.calls[0]![1] as StallState).fingerprint;

    mockWriteStallState.mockClear();
    mockReadStallState.mockResolvedValue({ fingerprint: realFp, firstSeenAt: 0 }); // 0 = very old

    const result = await runIterate(makeOpts({ stallTimeoutSeconds: 0, noAutoMarkReady: true }));

    // stallTimeoutSeconds: 0 means "never escalate for stall", but still refreshes firstSeenAt
    // so that re-enabling stall detection starts a fresh timer.
    expect(result.action).toBe("wait");
    expect(mockWriteStallState).toHaveBeenCalledOnce();
    const written = mockWriteStallState.mock.calls[0]![1] as StallState;
    expect(written.firstSeenAt).toBe(NOW);
    expect(written.fingerprint).toBe(realFp);
  });
});
