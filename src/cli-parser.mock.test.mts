import { readFileSync } from "node:fs";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./commands/check.mts", () => ({ runCheck: vi.fn() }));
vi.mock("./commands/resolve.mts", () => ({
  runResolveFetch: vi.fn(),
  runResolveMutate: vi.fn(),
}));
vi.mock("./commands/commit-suggestion.mts", () => ({
  runCommitSuggestion: vi.fn(),
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

import { main } from "./cli-parser.mts";
import { runCheck } from "./commands/check.mts";
import { runResolveFetch, runResolveMutate } from "./commands/resolve.mts";
import { runCommitSuggestion } from "./commands/commit-suggestion.mts";
import { runIterate } from "./commands/iterate.mts";
import { runStatus } from "./commands/status.mts";
import type { ShepherdReport, IterateResult } from "./types.mts";

const mockRunCheck = vi.mocked(runCheck);
const mockRunResolveFetch = vi.mocked(runResolveFetch);
const mockRunResolveMutate = vi.mocked(runResolveMutate);
const mockRunCommitSuggestion = vi.mocked(runCommitSuggestion);
const mockRunIterate = vi.mocked(runIterate);
const mockRunStatus = vi.mocked(runStatus);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stdoutSpy: any;
let stderrSpy: any;

function makeReport(overrides: Partial<ShepherdReport> = {}): ShepherdReport {
  return {
    pr: 42,
    nodeId: "PR_kgDOAAA",
    repo: "owner/repo",
    status: "READY",
    baseBranch: "main",
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
    reviewSummaries: [],
    approvedReviews: [],
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
    baseBranch: "main",
    checks: [] as import("./types.mts").RelevantCheck[],
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
        reason: "BEHIND + flaky CI — rebasing onto origin/main",
        shellScript:
          'if ! git diff --quiet || ! git diff --cached --quiet; then\n  echo "SKIP rebase: dirty worktree"\n  exit 1\nfi\ngit fetch origin && git rebase origin/main && git push --force-with-lease',
      },
    };
  if (action === "fix_code") {
    return {
      ...base,
      action: "fix_code",
      fix: {
        mode: "rebase-and-push",
        threads: [],
        actionableComments: [],
        noiseCommentIds: [],
        reviewSummaryIds: [],
        surfacedSummaries: [],
        checks: [],
        changesRequestedReviews: [],
        resolveCommand: {
          argv: ["npx", "pr-shepherd", "resolve", "42"],
          requiresHeadSha: true,
          requiresDismissMessage: false,
          hasMutations: false,
        },
        instructions: ["End this iteration."],
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
      reviewSummaries: [],
      commitSuggestionsEnabled: true,
    });
    await main(["node", "shepherd", "resolve", "42"]);
    expect(mockRunResolveFetch).toHaveBeenCalledTimes(1);
    expect(mockRunResolveMutate).not.toHaveBeenCalled();
  });

  it("formatFetchResult renders reviewSummaries section and includes them in total", async () => {
    mockRunResolveFetch.mockResolvedValue({
      actionableThreads: [],
      actionableComments: [],
      changesRequestedReviews: [],
      reviewSummaries: [{ id: "PRR_1", author: "copilot", body: "## PR overview\nsome detail" }],
      commitSuggestionsEnabled: true,
    });
    await main(["node", "shepherd", "resolve", "42"]);
    const out = stdoutSpy.mock.calls.map((c: string[]) => c[0]).join("");
    expect(out).toContain("Review summaries (1):");
    expect(out).toContain("reviewId=PRR_1 (@copilot): ## PR overview");
    expect(out).toContain("1 actionable item(s)");
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
// commit-suggestion dispatch
// ---------------------------------------------------------------------------

const APPLIED_RESULT = {
  pr: 42,
  repo: "owner/repo",
  threadId: "t1",
  path: "a.ts",
  startLine: 5,
  endLine: 5,
  author: "alice",
  applied: true as const,
  commitSha: "abc123",
  patch: "--- a/a.ts\n+++ b/a.ts\n@@ -5,1 +5,1 @@\n-old\n+new\n",
  postActionInstruction: "Run `git push` to publish the commit.",
};

const FAILED_RESULT = {
  pr: 42,
  repo: "owner/repo",
  threadId: "t1",
  path: "a.ts",
  startLine: 5,
  endLine: 5,
  author: "alice",
  applied: false as const,
  reason: "git apply rejected the patch: context mismatch",
  patch: "--- a/a.ts\n+++ b/a.ts\n@@ -5,1 +5,1 @@\n-old\n+new\n",
  postActionInstruction: "",
};

describe("main — commit-suggestion", () => {
  it("errors when --thread-id is omitted", async () => {
    await main(["node", "shepherd", "commit-suggestion", "42", "--message", "fix"]);
    expect(process.exitCode).toBe(1);
    expect(mockRunCommitSuggestion).not.toHaveBeenCalled();
    const err = stderrSpy.mock.calls.map((c: string[]) => c[0]).join("");
    expect(err).toContain("--thread-id");
  });

  it("errors when --message is omitted", async () => {
    await main(["node", "shepherd", "commit-suggestion", "42", "--thread-id", "t1"]);
    expect(process.exitCode).toBe(1);
    expect(mockRunCommitSuggestion).not.toHaveBeenCalled();
    const err = stderrSpy.mock.calls.map((c: string[]) => c[0]).join("");
    expect(err).toContain("--message");
  });

  it("calls runCommitSuggestion with correct args and exits 0 on applied", async () => {
    mockRunCommitSuggestion.mockResolvedValue(APPLIED_RESULT);
    await main([
      "node",
      "shepherd",
      "commit-suggestion",
      "42",
      "--thread-id",
      "t1",
      "--message",
      "apply fix",
    ]);
    expect(mockRunCommitSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({ prNumber: 42, threadId: "t1", message: "apply fix" }),
    );
    expect(process.exitCode).toBe(0);
  });

  it("passes --description when supplied", async () => {
    mockRunCommitSuggestion.mockResolvedValue(APPLIED_RESULT);
    await main([
      "node",
      "shepherd",
      "commit-suggestion",
      "--thread-id",
      "t1",
      "--message",
      "fix",
      "--description",
      "more detail",
    ]);
    expect(mockRunCommitSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({ description: "more detail" }),
    );
  });

  it("exits 1 when applied=false", async () => {
    mockRunCommitSuggestion.mockResolvedValue(FAILED_RESULT);
    await main(["node", "shepherd", "commit-suggestion", "--thread-id", "t1", "--message", "fix"]);
    expect(process.exitCode).toBe(1);
  });

  it("text output shows applied result with commit sha and post-action", async () => {
    mockRunCommitSuggestion.mockResolvedValue(APPLIED_RESULT);
    await main(["node", "shepherd", "commit-suggestion", "--thread-id", "t1", "--message", "fix"]);
    const out = getStdout();
    expect(out).toContain("Applied suggestion from @alice:");
    expect(out).toContain("a.ts (line 5)");
    expect(out).toContain("Commit: abc123");
    expect(out).toContain("git push");
  });

  it("text output shows patch diff block in success result", async () => {
    mockRunCommitSuggestion.mockResolvedValue(APPLIED_RESULT);
    await main(["node", "shepherd", "commit-suggestion", "--thread-id", "t1", "--message", "fix"]);
    const out = getStdout();
    expect(out).toContain("```diff");
    expect(out).toContain("--- a/a.ts");
  });

  it("errors when --message is whitespace only", async () => {
    await main(["node", "shepherd", "commit-suggestion", "--thread-id", "t1", "--message", "   "]);
    expect(process.exitCode).toBe(1);
    expect(mockRunCommitSuggestion).not.toHaveBeenCalled();
    const err = stderrSpy.mock.calls.map((c: string[]) => c[0]).join("");
    expect(err).toContain("--message");
  });

  it("text output shows failure with reason and patch", async () => {
    mockRunCommitSuggestion.mockResolvedValue(FAILED_RESULT);
    await main(["node", "shepherd", "commit-suggestion", "--thread-id", "t1", "--message", "fix"]);
    const out = getStdout();
    expect(out).toContain("Failed to apply suggestion t1:");
    expect(out).toContain("git apply rejected");
    expect(out).toContain("--- a/a.ts");
  });

  it("json output serialises the full result", async () => {
    mockRunCommitSuggestion.mockResolvedValue(APPLIED_RESULT);
    await main([
      "node",
      "shepherd",
      "commit-suggestion",
      "--thread-id",
      "t1",
      "--message",
      "fix",
      "--format",
      "json",
    ]);
    const out = getStdout();
    const parsed = JSON.parse(out.trim());
    expect(parsed).toMatchObject({ applied: true, commitSha: "abc123", threadId: "t1" });
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

  it("passes stallTimeoutSeconds derived from --stall-timeout to runIterate", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("wait"));
    await main(["node", "shepherd", "iterate", "42", "--stall-timeout", "15m"]);
    expect(mockRunIterate).toHaveBeenCalledWith(
      expect.objectContaining({ stallTimeoutSeconds: 15 * 60 }),
    );
  });
});

// ---------------------------------------------------------------------------
// formatIterateResult — text output shape (via main + stdout spy)
// ---------------------------------------------------------------------------

describe("main — iterate text format", () => {
  it("cooldown: heading, base/summary, log, then ## Instructions with end-iteration step", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("cooldown"));
    await main(["node", "shepherd", "iterate", "42"]);
    const lines = getStdout().trimEnd().split("\n");
    expect(lines[0]).toBe("# PR #42 [COOLDOWN]");
    expect(lines[1]).toBe("");
    expect(lines[2]).toBe(
      "**status** `IN_PROGRESS` · **merge** `BLOCKED` · **state** `OPEN` · **repo** `owner/repo`",
    );
    expect(lines[3]).toMatch(/^\*\*summary\*\* 0 passing, 0 skipped, 0 filtered, 1 inProgress /);
    expect(lines[4]).toBe("");
    expect(lines[5]).toBe("SKIP: CI still starting");
    expect(lines[6]).toBe("");
    expect(lines[7]).toBe("## Instructions");
    expect(lines[8]).toBe("");
    expect(lines[9]).toMatch(/End this iteration/);
  });

  it("wait: heading includes [WAIT] tag, log body follows header, ## Instructions present", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("wait"));
    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toMatch(/^# PR #42 \[WAIT\]\n/);
    expect(out).toContain("WAIT: 0 passing, 1 in-progress");
    expect(out).toContain("## Instructions");
    expect(out).toContain("1. End this iteration");
  });

  it("rerun_ci: heading includes [RERUN_CI] tag, log, and ## Instructions with gh run rerun", async () => {
    mockRunIterate.mockResolvedValue({
      ...makeIterateResult("rerun_ci"),
      log: "RERUN NEEDED — 1 CI run: run-99 (typecheck — timeout)",
      reran: [{ runId: "run-99", checkNames: ["typecheck"], failureKind: "timeout" }],
    } as IterateResult);
    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toContain("# PR #42 [RERUN_CI]");
    expect(out).toContain("RERUN NEEDED");
    expect(out).toContain("## Instructions");
    expect(out).toContain("gh run rerun run-99 --failed");
  });

  it("mark_ready: heading includes [MARK_READY] tag and ## Instructions with end-iteration step", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("mark_ready"));
    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toContain("# PR #42 [MARK_READY]");
    expect(out).toContain("MARKED READY: PR 42");
    expect(out).toContain("## Instructions");
    expect(out).toContain("1. The CLI already marked the PR ready for review");
  });

  it("cancel: heading includes [CANCEL] tag and ## Instructions with loop-cancel steps", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("cancel"));
    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toContain("# PR #42 [CANCEL]");
    expect(out).toContain("## Instructions");
    expect(out).toContain("1. Invoke `/loop cancel` via the Skill tool.");
    expect(out).toContain("2. Stop.");
  });

  it("rebase: heading, base/summary lines, reason, fenced shell script, then ## Instructions", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("rebase"));
    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    const lines = out.trimEnd().split("\n");
    expect(lines[0]).toBe("# PR #42 [REBASE]");
    expect(lines[2]).toMatch(/^\*\*status\*\* `IN_PROGRESS` /);
    expect(out).toContain("BEHIND + flaky CI — rebasing onto origin/main");
    // Shell script is inside a ```bash fenced block.
    const fenceStart = lines.findIndex((l) => l === "```bash");
    const fenceEnd = lines.indexOf("```", fenceStart + 1);
    expect(fenceStart).toBeGreaterThan(-1);
    expect(fenceEnd).toBeGreaterThan(fenceStart);
    const script = lines.slice(fenceStart + 1, fenceEnd).join("\n");
    expect(script).toContain("if ! git diff --quiet");
    expect(script).toContain(
      "git fetch origin && git rebase origin/main && git push --force-with-lease",
    );
    // ## Instructions appears after the fenced block.
    const instrIdx = lines.indexOf("## Instructions");
    expect(instrIdx).toBeGreaterThan(fenceEnd);
    expect(out).toContain("1. Copy the shell script from the");
    expect(out).toContain("2. End this iteration");
  });

  it("escalate: heading, base/summary, humanMessage, then ## Instructions with loop-cancel steps", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("escalate"));
    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toMatch(/^# PR #42 \[ESCALATE\]\n/);
    expect(out).toContain("**status** `IN_PROGRESS`");
    expect(out).toContain("⚠️  /pr-shepherd:monitor paused — needs human direction");
    expect(out).toContain("## Instructions");
    expect(out).toContain("1. Invoke `/loop cancel` via the Skill tool.");
    expect(out).toContain("2. Stop — the PR needs human direction");
  });

  it("fix_code (empty payload): heading + base/summary + Post-fix push + fallback Instructions", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("fix_code"));
    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toContain("# PR #42 [FIX_CODE]");
    expect(out).toContain("## Post-fix push");
    expect(out).not.toContain("## Rebase");
    expect(out).toContain("- base: `main`");
    expect(out).toContain('- resolve: `npx pr-shepherd resolve 42 --require-sha "$HEAD_SHA"`');
    // No item sections.
    expect(out).not.toContain("## Review threads");
    expect(out).not.toContain("## Actionable comments");
    expect(out).not.toContain("## Failing checks");
    expect(out).not.toContain("## Changes-requested reviews");
    expect(out).not.toContain("## Noise");
    expect(out).not.toContain("## Cancelled runs");
    // Fallback instruction always present for consistency with the invariant that
    // every iterate output ends with ## Instructions.
    expect(out).toContain("## Instructions");
    expect(out).toContain("1. End this iteration.");
  });

  it("fix_code (rich payload): sections appear in fixed order with backtick-quoted codes", async () => {
    const result: IterateResult = {
      ...makeIterateResult("fix_code"),
    };
    if (result.action !== "fix_code") throw new Error("unreachable");
    result.fix = {
      mode: "rebase-and-push",
      threads: [
        {
          id: "PRRT_1",
          path: "src/foo.ts",
          line: 10,
          author: "reviewer",
          body: "fix\nsecond line is now preserved",
        },
      ],
      actionableComments: [{ id: "PRRC_1", author: "bot", body: "please address" }],
      noiseCommentIds: ["c-noise-1", "c-noise-2"],
      reviewSummaryIds: [],
      surfacedSummaries: [],
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
        hasMutations: true,
      },
      instructions: ["step one", "step two"],
    };
    result.cancelled = ["run-99"];
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();

    // Section ordering: threads → comments → checks → reviews → noise → cancelled → Post-fix push → Instructions.
    const order = [
      "## Review threads",
      "## Actionable comments",
      "## Failing checks",
      "## Changes-requested reviews",
      "## Noise (minimize only)",
      "## Cancelled runs",
      "## Post-fix push",
      "## Instructions",
    ];
    let cursor = 0;
    for (const heading of order) {
      const idx = out.indexOf(heading, cursor);
      expect(idx).toBeGreaterThanOrEqual(cursor);
      cursor = idx + heading.length;
    }

    // Thread section: H3 header with backticked id and location.
    expect(out).toContain("### `PRRT_1` — `src/foo.ts:10` (@reviewer)");
    // Multi-line body is blockquoted.
    expect(out).toContain("> fix\n> second line is now preserved");
    // Comment section
    expect(out).toContain("### `PRRC_1` (@bot)");
    expect(out).toContain("> please address");
    // Failing checks — GitHub Actions and external.
    expect(out).toContain("- `run-42` — `lint` (actionable)");
    expect(out).toContain("- external `https://app.codecov.io` — `codecov/patch` (actionable)");
    // Reviews
    expect(out).toContain("- `REV_1` (@reviewer)");
    // Noise — backticked IDs, comma-separated.
    expect(out).toContain("`c-noise-1`, `c-noise-2`");
    // Cancelled runs
    expect(out).toContain("`run-99`");
    // Post-fix push section uses backticked base + resolve command with --require-sha appended.
    expect(out).toContain("- base: `main`");
    expect(out).toContain(
      '- resolve: `npx pr-shepherd resolve 42 --dismiss-review-ids REV_1 --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`',
    );
    // Instructions are numbered.
    expect(out).toContain("1. step one");
    expect(out).toContain("2. step two");
  });

  it("fix_code: renders '## Review summaries (minimize only)' section when reviewSummaryIds is non-empty", async () => {
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code") throw new Error("unreachable");
    if (result.fix.mode !== "rebase-and-push") throw new Error("unreachable");
    result.fix.reviewSummaryIds = ["PRR_BOT", "PRR_AP"];
    result.fix.resolveCommand = {
      argv: ["npx", "pr-shepherd", "resolve", "42", "--minimize-comment-ids", "PRR_BOT,PRR_AP"],
      requiresHeadSha: false,
      requiresDismissMessage: false,
      hasMutations: true,
    };
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();

    expect(out).toContain("## Review summaries (minimize only)");
    expect(out).toContain("`PRR_BOT`, `PRR_AP`");
    expect(out).toContain(
      "- resolve: `npx pr-shepherd resolve 42 --minimize-comment-ids PRR_BOT,PRR_AP`",
    );
    expect(out).not.toContain("## Review summaries (surfaced");
  });

  it("fix_code: renders '## Review summaries (surfaced — not minimized)' with H3 + blockquote", async () => {
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code") throw new Error("unreachable");
    if (result.fix.mode !== "rebase-and-push") throw new Error("unreachable");
    result.fix.surfacedSummaries = [
      { id: "PRR_HUMAN", author: "alice", body: "Looks reasonable but please double-check X." },
    ];
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();

    expect(out).toContain("## Review summaries (surfaced — not minimized)");
    expect(out).toContain("### `PRR_HUMAN` (@alice)");
    expect(out).toContain("> Looks reasonable but please double-check X.");
  });

  it("fix_code: multi-paragraph thread body is preserved verbatim in the blockquote", async () => {
    const multiParagraphBody = [
      "First paragraph giving context.",
      "",
      "Second paragraph with a specific suggestion about line 42.",
      "",
      "Third paragraph with a ```suggestion``` block that must survive.",
    ].join("\n");
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code") throw new Error("unreachable");
    result.fix.threads = [
      {
        id: "t-multi",
        path: "src/x.ts",
        line: 1,
        author: "reviewer",
        body: multiParagraphBody,
      },
    ];
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    const lines = out.split("\n");
    const headerIdx = lines.findIndex((l) => l === "### `t-multi` — `src/x.ts:1` (@reviewer)");
    expect(headerIdx).toBeGreaterThan(-1);
    // Blockquote follows after a blank line; empty paragraphs are rendered as bare `>`.
    expect(lines[headerIdx + 2]).toBe("> First paragraph giving context.");
    expect(lines[headerIdx + 3]).toBe(">");
    expect(lines[headerIdx + 4]).toBe(
      "> Second paragraph with a specific suggestion about line 42.",
    );
    expect(lines[headerIdx + 5]).toBe(">");
    expect(lines[headerIdx + 6]).toBe(
      "> Third paragraph with a ```suggestion``` block that must survive.",
    );
  });

  it("fix_code: check with runId=null + detailsUrl renders 'external `<url>`', without detailsUrl falls back to '(no runId)'", async () => {
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code" || result.fix.mode !== "rebase-and-push") {
      throw new Error("unreachable");
    }
    result.fix.checks = [
      {
        name: "codecov/patch",
        runId: null,
        detailsUrl: "https://app.codecov.io/a/b",
        failureKind: "actionable",
      },
      {
        name: "mystery-check",
        runId: null,
        detailsUrl: null,
        failureKind: "actionable",
      },
    ];
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toContain("- external `https://app.codecov.io/a/b` — `codecov/patch` (actionable)");
    expect(out).toContain("- (no runId) — `mystery-check` (actionable)");
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

  // Per CLAUDE.md output-format invariant: text and JSON must surface equivalent
  // information. This is a smoke test for the scalar base fields — adding a new
  // field to IterateResultBase without a text representation should fail here.
  it("format parity: text output surfaces every scalar base field that JSON carries", async () => {
    const result = makeIterateResult("wait");
    mockRunIterate.mockResolvedValue(result);
    await main(["node", "shepherd", "iterate", "42"]);
    const text = getStdout();
    // pr, status, mergeStateStatus, state, summary counts, remainingSeconds
    // are the scalars the cron runner + docs rely on. If any of these are
    // silently dropped from the text path a downstream parser breaks.
    expect(text).toContain(`# PR #${result.pr}`);
    expect(text).toContain(`\`${result.status}\``);
    expect(text).toContain(`\`${result.mergeStateStatus}\``);
    expect(text).toContain(`\`${result.state}\``);
    expect(text).toContain(`${result.summary.passing} passing`);
    expect(text).toContain(`${result.summary.inProgress} inProgress`);
    expect(text).toContain(`**remainingSeconds** ${result.remainingSeconds}`);
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

// ---------------------------------------------------------------------------
// --version / -v
// ---------------------------------------------------------------------------

describe("main — --version", () => {
  const pkgVersion = (
    JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      version: string;
    }
  ).version;

  it("prints the exact package.json version followed by a newline for --version", async () => {
    await main(["node", "shepherd", "--version"]);
    expect(getStdout()).toBe(`${pkgVersion}\n`);
    expect(process.exitCode).toBeUndefined();
  });

  it("also accepts -v with identical output", async () => {
    await main(["node", "shepherd", "-v"]);
    expect(getStdout()).toBe(`${pkgVersion}\n`);
    expect(process.exitCode).toBeUndefined();
  });
});
