import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./commands/check.mts", () => ({ runCheck: vi.fn() }));
vi.mock("./commands/resolve.mts", () => ({
  runResolveFetch: vi.fn(),
  runResolveMutate: vi.fn(),
}));
vi.mock("./commands/iterate.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./commands/iterate.mts")>();
  return { ...actual, runIterate: vi.fn() };
});
vi.mock("./commands/status.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./commands/status.mts")>();
  return {
    ...actual,
    runStatus: vi.fn(),
    formatStatusTable: vi.fn().mockReturnValue("status table"),
  };
});
vi.mock("./github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "owner", name: "repo" }),
}));

import { main } from "./cli.mts";
import { runCheck } from "./commands/check.mts";
import { runResolveFetch, runResolveMutate } from "./commands/resolve.mts";
import { runIterate } from "./commands/iterate.mts";
import { runStatus } from "./commands/status.mts";
import type { ShepherdReport, IterateResult } from "./types.mts";

const mockRunCheck = vi.mocked(runCheck);
const mockRunResolveFetch = vi.mocked(runResolveFetch);
const mockRunResolveMutate = vi.mocked(runResolveMutate);
const mockRunIterate = vi.mocked(runIterate);
const mockRunStatus = vi.mocked(runStatus);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stdoutSpy: any;
let stderrSpy: any;

function makeReport(overrides: Partial<ShepherdReport> = {}): ShepherdReport {
  return {
    pr: 42,
    repo: "owner/repo",
    status: "READY",
    mergeStatus: {
      status: "CLEAN",
      state: "OPEN",
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
    threads: { actionable: [], autoResolved: [], autoResolveErrors: [] },
    comments: { actionable: [] },
    changesRequestedReviews: [],
    ...overrides,
  };
}

function makeIterateResult(action: IterateResult["action"] = "wait"): IterateResult {
  const base = {
    pr: 42,
    repo: "owner/repo",
    status: "IN_PROGRESS" as const,
    state: "OPEN" as const,
    mergeStateStatus: "BLOCKED" as const,
    copilotReviewInProgress: false,
    isDraft: false,
    shouldCancel: false,
    remainingSeconds: 60,
    summary: { passing: 0, skipped: 0, filtered: 0, inProgress: 1 },
  };
  if (action === "cooldown") return { ...base, action: "cooldown", log: "SKIP: CI still starting" };
  if (action === "wait") return { ...base, action: "wait", log: "WAIT: 0 passing, 1 in-progress" };
  if (action === "rerun_ci")
    return { ...base, action: "rerun_ci", log: "RERAN: run-99 (typecheck — transient)", reran: [] };
  if (action === "mark_ready")
    return { ...base, action: "mark_ready", markedReady: true, log: "MARKED READY: PR 42" };
  if (action === "rebase")
    return {
      ...base,
      action: "rebase",
      rebase: {
        baseBranch: "main",
        reason: "BEHIND + flaky CI — rebasing onto origin/main",
        shellScript:
          'if ! git diff --quiet || ! git diff --cached --quiet; then\n  echo "SKIP rebase: dirty worktree"\n  exit 0\nfi\ngit fetch origin && git rebase origin/main && git push --force-with-lease',
      },
    };
  if (action === "fix_code") {
    return {
      ...base,
      action: "fix_code",
      fix: {
        threads: [],
        actionableComments: [],
        noiseCommentIds: [],
        checks: [],
        changesRequestedReviews: [],
        baseBranch: "main",
        resolveCommand: {
          argv: ["npx", "pr-shepherd", "resolve", "42"],
          requiresHeadSha: true,
          requiresDismissMessage: false,
        },
        instructions: [],
      },
      cancelled: [],
    };
  }
  if (action === "cancel")
    return { ...base, action: "cancel", log: "CANCEL: PR #42 — stopping monitor" };
  if (action === "escalate") {
    return {
      ...base,
      action: "escalate",
      escalate: {
        triggers: [],
        unresolvedThreads: [],
        ambiguousComments: [],
        changesRequestedReviews: [],
        suggestion: "check manually",
        humanMessage: "⚠️  /pr-shepherd:monitor paused — needs human direction",
      },
    };
  }
  return { ...base, action: "wait", log: "WAIT: 0 passing, 1 in-progress" };
}

function getStdout(): string {
  return stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
}

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  mockRunStatus.mockResolvedValue([]);
});

afterEach(() => {
  process.exitCode = undefined;
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// check dispatch
// ---------------------------------------------------------------------------

describe("main — check", () => {
  it("calls runCheck and exits with statusToExitCode(READY)=0", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ status: "READY" }));
    await main(["node", "shepherd", "check", "42"]);
    expect(mockRunCheck).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(0);
  });

  it("exits with code 1 for FAILING status", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ status: "FAILING" }));
    await main(["node", "shepherd", "check", "42"]);
    expect(process.exitCode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// resolve dispatch
// ---------------------------------------------------------------------------

describe("main — resolve", () => {
  it("calls runResolveFetch when no mutation flags are given (fetch mode)", async () => {
    mockRunResolveFetch.mockResolvedValue({
      actionableThreads: [],
      actionableComments: [],
      changesRequestedReviews: [],
    });
    await main(["node", "shepherd", "resolve", "42"]);
    expect(mockRunResolveFetch).toHaveBeenCalledTimes(1);
    expect(mockRunResolveMutate).not.toHaveBeenCalled();
  });

  it("calls runResolveMutate when --resolve-thread-ids is given", async () => {
    mockRunResolveMutate.mockResolvedValue({
      resolvedThreads: ["t-1"],
      minimizedComments: [],
      dismissedReviews: [],
      errors: [],
    });
    await main(["node", "shepherd", "resolve", "42", "--resolve-thread-ids", "t-1"]);
    expect(mockRunResolveMutate).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// iterate dispatch
// ---------------------------------------------------------------------------

describe("main — iterate", () => {
  it("exits with iterateActionToExitCode(fix_code)=1", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("fix_code"));
    await main(["node", "shepherd", "iterate", "42"]);
    expect(process.exitCode).toBe(1);
  });

  it("exits with 0 for wait action", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("wait"));
    await main(["node", "shepherd", "iterate", "42"]);
    expect(process.exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// formatIterateResult — text output shape (via main + stdout spy)
// ---------------------------------------------------------------------------

describe("main — iterate text format", () => {
  it("cooldown: first line has base prefix and log; ends with info line", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("cooldown"));
    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out.startsWith("PR #42 [COOLDOWN] status=IN_PROGRESS merge=BLOCKED state=OPEN —")).toBe(
      true,
    );
    expect(out).toContain("— SKIP: CI still starting");
    expect(out).toContain(
      "info: repo=owner/repo passing=0 skipped=0 filtered=0 inProgress=1 remainingSeconds=60 copilotReviewInProgress=false isDraft=false shouldCancel=false",
    );
  });

  it("wait: base prefix includes [WAIT] tag", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("wait"));
    await main(["node", "shepherd", "iterate", "42"]);
    expect(getStdout()).toMatch(/^PR #42 \[WAIT\] .* — WAIT: 0 passing, 1 in-progress/);
  });

  it("rerun_ci: base prefix includes [RERUN_CI] tag and log", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("rerun_ci"));
    await main(["node", "shepherd", "iterate", "42"]);
    expect(getStdout()).toContain("[RERUN_CI]");
    expect(getStdout()).toContain("— RERAN: run-99 (typecheck — transient)");
  });

  it("mark_ready: base prefix includes [MARK_READY] tag", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("mark_ready"));
    await main(["node", "shepherd", "iterate", "42"]);
    expect(getStdout()).toContain("[MARK_READY]");
    expect(getStdout()).toContain("— MARKED READY: PR 42");
  });

  it("cancel: base prefix includes [CANCEL] tag", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("cancel"));
    await main(["node", "shepherd", "iterate", "42"]);
    expect(getStdout()).toContain("[CANCEL]");
  });

  it("rebase: emits base prefix with reason, then the shell script, then info line", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("rebase"));
    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    const lines = out.trimEnd().split("\n");
    expect(lines[0]).toMatch(/^PR #42 \[REBASE\] .* — BEHIND \+ flaky CI/);
    expect(out).toContain(
      "git fetch origin && git rebase origin/main && git push --force-with-lease",
    );
    expect(lines[lines.length - 1]).toMatch(/^info: repo=owner\/repo /);
  });

  it("escalate: base prefix on its own line, then humanMessage, then info line", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("escalate"));
    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    const lines = out.trimEnd().split("\n");
    expect(lines[0]).toBe("PR #42 [ESCALATE] status=IN_PROGRESS merge=BLOCKED state=OPEN");
    expect(out).toContain("⚠️  /pr-shepherd:monitor paused — needs human direction");
    expect(lines[lines.length - 1]).toMatch(/^info: repo=owner\/repo /);
  });

  it("fix_code (empty payload): base prefix, base branch, resolve line, info line", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("fix_code"));
    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toContain("PR #42 [FIX_CODE] status=IN_PROGRESS merge=BLOCKED state=OPEN");
    expect(out).toContain("  base: main");
    // shellJoinArgv appends --require-sha "$HEAD_SHA" since requiresHeadSha is true
    expect(out).toContain('  resolve: npx pr-shepherd resolve 42 --require-sha "$HEAD_SHA"');
    // Nothing to do: no threads, no comments, no noise, no checks, no reviews, no cancelled
    expect(out).not.toContain("  thread ");
    expect(out).not.toContain("  comment ");
    expect(out).not.toContain("  noise ");
    expect(out).not.toContain("  check ");
    expect(out).not.toContain("  review ");
    expect(out).not.toContain("  cancelled runs");
  });

  it("fix_code (rich payload): renders threads, actionable comments, noise, checks, reviews, cancelled in order", async () => {
    const result: IterateResult = {
      ...makeIterateResult("fix_code"),
    };
    if (result.action !== "fix_code") throw new Error("unreachable");
    result.fix = {
      threads: [
        {
          id: "PRRT_1",
          path: "src/foo.ts",
          line: 10,
          author: "reviewer",
          body: "fix\nsecond line should be dropped",
        },
      ],
      actionableComments: [{ id: "PRRC_1", author: "bot", body: "please address" }],
      noiseCommentIds: ["c-noise-1", "c-noise-2"],
      checks: [
        { name: "lint", runId: "run-42", detailsUrl: "https://x", failureKind: "actionable" },
        {
          name: "codecov/patch",
          runId: null,
          detailsUrl: "https://app.codecov.io",
          failureKind: "actionable",
        },
      ],
      changesRequestedReviews: [{ id: "REV_1", author: "reviewer", body: "please rework this" }],
      baseBranch: "main",
      resolveCommand: {
        argv: [
          "npx",
          "pr-shepherd",
          "resolve",
          "42",
          "--dismiss-review-ids",
          "REV_1",
          "--message",
          "$DISMISS_MESSAGE",
        ],
        requiresHeadSha: true,
        requiresDismissMessage: true,
      },
      instructions: ["step one", "step two"],
    };
    result.cancelled = ["run-99"];
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    const lines = out.trimEnd().split("\n");

    // Line-by-line ordering invariants:
    expect(lines[0]).toBe("PR #42 [FIX_CODE] status=IN_PROGRESS merge=BLOCKED state=OPEN");
    expect(lines[1]).toBe("  thread PRRT_1 src/foo.ts:10 (@reviewer): fix");
    expect(lines[2]).toBe("  comment PRRC_1 (@bot): please address");
    expect(lines[3]).toBe("  noise (minimize only): c-noise-1, c-noise-2");
    expect(lines[4]).toBe("  check run-42 — lint (actionable)");
    expect(lines[5]).toBe("  check (no runId) — codecov/patch (actionable)");
    expect(lines[6]).toBe("  review REV_1 (@reviewer): changes requested");
    expect(lines[7]).toBe("  cancelled runs: run-99");
    expect(lines[8]).toBe("  base: main");
    expect(lines[9]).toBe(
      '  resolve: npx pr-shepherd resolve 42 --dismiss-review-ids REV_1 --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"',
    );
    expect(lines[10]).toBe("  1. step one");
    expect(lines[11]).toBe("  2. step two");
    expect(lines[lines.length - 1]).toMatch(/^info: repo=owner\/repo /);
  });

  it("fix_code: thread body is truncated to first-line prefix (120 chars)", async () => {
    const longBody = "a".repeat(300);
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code") throw new Error("unreachable");
    result.fix.threads = [
      {
        id: "t-long",
        path: "src/x.ts",
        line: 1,
        author: "r",
        body: longBody,
      },
    ];
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    const threadLine = out.split("\n").find((l) => l.startsWith("  thread t-long "));
    expect(threadLine).toBeDefined();
    // The ": " prefix plus 120 body chars — no more.
    expect(threadLine!.split(": ").at(-1)!.length).toBe(120);
  });

  it("json format: emits a single JSON.stringify(result)+newline, no formatter output", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("wait"));
    await main(["node", "shepherd", "iterate", "42", "--format", "json"]);
    const out = getStdout().trimEnd();
    expect(() => JSON.parse(out)).not.toThrow();
    const parsed = JSON.parse(out);
    expect(parsed.action).toBe("wait");
    expect(parsed.pr).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// status dispatch
// ---------------------------------------------------------------------------

describe("main — status", () => {
  it("writes usage to stderr and exits 1 when no PR numbers given", async () => {
    await main(["node", "shepherd", "status"]);
    const stderrOutput = stderrSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
    expect(stderrOutput).toContain("Usage");
    expect(process.exitCode).toBe(1);
  });

  it("calls runStatus and exits 0 when all PRs are ready", async () => {
    mockRunStatus.mockResolvedValue([
      {
        number: 1,
        title: "Test",
        state: "OPEN",
        isDraft: false,
        mergeStateStatus: "CLEAN",
        reviewDecision: "APPROVED",
        unresolvedThreads: 0,
        ciState: "SUCCESS",
        threadsTruncated: false,
      },
    ]);
    await main(["node", "shepherd", "status", "1"]);
    expect(mockRunStatus).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// unknown subcommand
// ---------------------------------------------------------------------------

describe("main — unknown subcommand", () => {
  it("writes error to stderr and exits 1", async () => {
    await main(["node", "shepherd", "unknown-command"]);
    const stderrOutput = stderrSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
    expect(stderrOutput).toContain("Unknown subcommand");
    expect(process.exitCode).toBe(1);
  });
});
