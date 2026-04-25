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

import { runIterate, renderResolveCommand } from "./iterate.mts";
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
      minimizeApprovals: false,
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
              url: "",
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
