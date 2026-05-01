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

function makeActionableCheck(runId: string, name = "typecheck") {
  return {
    name,
    status: "COMPLETED" as const,
    conclusion: "FAILURE" as const,
    detailsUrl: `https://github.com/owner/repo/actions/runs/${runId}`,
    event: "pull_request",
    runId,
    category: "failing" as const,
  };
}

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
      url: "",
      createdAtUnix: 1700000000,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: { actionable: [thread], autoResolved: [], autoResolveErrors: [], firstLook: [] },
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
      url: "",
      createdAtUnix: 1700000000,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        comments: { actionable: [comment], firstLook: [] },
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

  it("emits AgentCheck shape — has conclusion; no failureKind/category/logTail on fix.checks", async () => {
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

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code" && result.fix.mode === "rebase-and-push") {
      const c = result.fix.checks[0]!;
      expect(c.name).toBe("typecheck");
      expect(c.runId).toBe("run-55");
      expect(c.detailsUrl).toBeDefined();
      expect(c).toHaveProperty("conclusion");
      expect(c).not.toHaveProperty("failureKind");
      expect(c).not.toHaveProperty("category");
      expect(c).not.toHaveProperty("logTail");
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

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code" && result.fix.mode === "rebase-and-push") {
      const instructionsJoined = result.fix.instructions.join("\n");
      // GitHub Actions check with runId — agent fetches logs and decides rerun vs fix
      expect(instructionsJoined).toContain("gh run view <runId> --log-failed");
      expect(instructionsJoined).toContain("gh run rerun");
      // External check with detailsUrl but no runId — open details URL
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

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code" && result.fix.mode === "rebase-and-push") {
      expect(result.fix.checks).toHaveLength(3);
      const joined = result.fix.instructions.join("\n");
      // All three instruction variants present:
      expect(joined).toContain("with a run ID");
      expect(joined).toContain("external status check");
      expect(joined).toContain("(no runId)");
      // And each appears exactly once:
      expect(joined.match(/with a run ID/g)).toHaveLength(1);
      expect(joined.match(/external status check/g)).toHaveLength(1);
      expect(joined.match(/\(no runId\)/g)).toHaveLength(1);
    }
  });
});

// fix_code (merge conflicts) tests moved to iterate.fix-code-conflicts.mock.test.mts
