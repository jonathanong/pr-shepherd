import { readFileSync } from "node:fs";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./commands/check.mts", () => ({ runCheck: vi.fn() }));
vi.mock("./commands/resolve.mts", () => ({
  runResolveFetch: vi.fn(),
  runResolveMutate: vi.fn(),
}));
vi.mock("./commands/commit-suggestions.mts", () => ({
  runCommitSuggestions: vi.fn(),
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
import { runCommitSuggestions } from "./commands/commit-suggestions.mts";
import { runIterate } from "./commands/iterate.mts";
import { runStatus } from "./commands/status.mts";
import type { ShepherdReport, IterateResult } from "./types.mts";

const mockRunCheck = vi.mocked(runCheck);
const mockRunResolveFetch = vi.mocked(runResolveFetch);
const mockRunResolveMutate = vi.mocked(runResolveMutate);
const mockRunCommitSuggestions = vi.mocked(runCommitSuggestions);
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
        checks: [],
        changesRequestedReviews: [],
        resolveCommand: {
          argv: ["npx", "pr-shepherd", "resolve", "42"],
          requiresHeadSha: true,
          requiresDismissMessage: false,
          hasMutations: false,
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
// commit-suggestions dispatch
// ---------------------------------------------------------------------------

describe("main — commit-suggestions", () => {
  it("errors when --thread-ids is omitted", async () => {
    await main(["node", "shepherd", "commit-suggestions", "42"]);
    expect(process.exitCode).toBe(1);
    expect(mockRunCommitSuggestions).not.toHaveBeenCalled();
    const err = stderrSpy.mock.calls.map((c: string[]) => c[0]).join("");
    expect(err).toContain("--thread-ids");
  });

  it("calls runCommitSuggestions with parsed thread IDs and exits 0 on applied", async () => {
    mockRunCommitSuggestions.mockResolvedValue({
      pr: 42,
      repo: "owner/repo",
      newHeadSha: "newsha",
      commitUrl: "https://commit/url",
      threads: [{ id: "t1", status: "applied", path: "a.ts", author: "alice" }],
      applied: true,
      postActionInstruction: "Run `git pull --ff-only` before editing.",
    });
    await main(["node", "shepherd", "commit-suggestions", "42", "--thread-ids", "t1,t2"]);
    expect(mockRunCommitSuggestions).toHaveBeenCalledWith(
      expect.objectContaining({ prNumber: 42, threadIds: ["t1", "t2"] }),
    );
    expect(process.exitCode).toBe(0);
  });

  it("exits 1 when nothing applied", async () => {
    mockRunCommitSuggestions.mockResolvedValue({
      pr: 42,
      repo: "owner/repo",
      newHeadSha: null,
      commitUrl: null,
      threads: [{ id: "t1", status: "skipped", reason: "no suggestion block" }],
      applied: false,
      postActionInstruction: "No commit was created. Nothing to pull.",
    });
    await main(["node", "shepherd", "commit-suggestions", "42", "--thread-ids", "t1"]);
    expect(process.exitCode).toBe(1);
  });

  it("text output lists applied and skipped threads plus the post-action instruction", async () => {
    mockRunCommitSuggestions.mockResolvedValue({
      pr: 42,
      repo: "owner/repo",
      newHeadSha: "newsha",
      commitUrl: "https://commit/url",
      threads: [
        { id: "t1", status: "applied", path: "a.ts", author: "alice" },
        { id: "t2", status: "skipped", reason: "no suggestion block" },
      ],
      applied: true,
      postActionInstruction: "Run `git pull --ff-only` before editing.",
    });
    await main(["node", "shepherd", "commit-suggestions", "42", "--thread-ids", "t1,t2"]);
    const out = getStdout();
    expect(out).toContain("Applied 1 suggestion(s):");
    expect(out).toContain("- t1 → a.ts");
    expect(out).toContain("Skipped 1 thread(s):");
    expect(out).toContain("- t2: no suggestion block");
    expect(out).toContain("Commit: https://commit/url");
    expect(out).toContain("New HEAD: newsha");
    expect(out).toContain("Run `git pull --ff-only`");
  });

  it("json output serialises the full result", async () => {
    const result = {
      pr: 42,
      repo: "owner/repo",
      newHeadSha: "newsha",
      commitUrl: "https://commit/url",
      threads: [{ id: "t1", status: "applied" as const, path: "a.ts", author: "alice" }],
      applied: true,
      postActionInstruction: "Run `git pull --ff-only` before editing.",
    };
    mockRunCommitSuggestions.mockResolvedValue(result);
    await main([
      "node",
      "shepherd",
      "commit-suggestions",
      "42",
      "--thread-ids",
      "t1",
      "--format",
      "json",
    ]);
    const out = getStdout();
    expect(JSON.parse(out.trim())).toEqual(result);
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
  it("cooldown: line 1 is base+log, line 2 is info", async () => {
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
    expect(lines).toHaveLength(6);
  });

  it("wait: heading includes [WAIT] tag and log body follows header", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("wait"));
    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toMatch(/^# PR #42 \[WAIT\]\n/);
    expect(out).toContain("WAIT: 0 passing, 1 in-progress");
  });

  it("rerun_ci: heading includes [RERUN_CI] tag and log", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("rerun_ci"));
    await main(["node", "shepherd", "iterate", "42"]);
    expect(getStdout()).toContain("# PR #42 [RERUN_CI]");
    expect(getStdout()).toContain("RERAN: run-99 (typecheck — transient)");
  });

  it("mark_ready: heading includes [MARK_READY] tag", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("mark_ready"));
    await main(["node", "shepherd", "iterate", "42"]);
    expect(getStdout()).toContain("# PR #42 [MARK_READY]");
    expect(getStdout()).toContain("MARKED READY: PR 42");
  });

  it("cancel: heading includes [CANCEL] tag", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("cancel"));
    await main(["node", "shepherd", "iterate", "42"]);
    expect(getStdout()).toContain("# PR #42 [CANCEL]");
  });

  it("rebase: heading, base/summary lines, reason, then fenced shell script", async () => {
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
  });

  it("escalate: heading, base/summary, then humanMessage", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("escalate"));
    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toMatch(/^# PR #42 \[ESCALATE\]\n/);
    expect(out).toContain("**status** `IN_PROGRESS`");
    expect(out).toContain("⚠️  /pr-shepherd:monitor paused — needs human direction");
  });

  it("fix_code (empty payload): heading + base/summary + Post-fix push section only (no items, no Instructions)", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("fix_code"));
    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toContain("# PR #42 [FIX_CODE]");
    expect(out).toContain("## Post-fix push");
    expect(out).not.toContain("## Rebase");
    expect(out).toContain("- base: `main`");
    expect(out).toContain('- resolve: `npx pr-shepherd resolve 42 --require-sha "$HEAD_SHA"`');
    // No item sections, no instructions (empty fix + no instructions in fixture).
    expect(out).not.toContain("## Review threads");
    expect(out).not.toContain("## Actionable comments");
    expect(out).not.toContain("## Failing checks");
    expect(out).not.toContain("## Changes-requested reviews");
    expect(out).not.toContain("## Noise");
    expect(out).not.toContain("## Cancelled runs");
    expect(out).not.toContain("## Instructions");
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

  it("fix_code (commit-suggestions mode): emits ## Commit suggestions and two-step instructions", async () => {
    const result: IterateResult = {
      ...makeIterateResult("fix_code"),
    };
    if (result.action !== "fix_code") throw new Error("unreachable");
    result.fix = {
      mode: "commit-suggestions",
      threads: [
        {
          id: "PRRT_x",
          path: "src/foo.ts",
          line: 10,
          author: "reviewer",
          body: "use a const\n\n```suggestion\nconst x = 1;\n```",
        },
        {
          id: "PRRT_y",
          path: "src/bar.ts",
          line: 20,
          author: "reviewer2",
          body: "rename it\n\n```suggestion\nconst better = 2;\n```",
        },
      ],
      commitSuggestionsCommand: {
        argv: [
          "npx",
          "pr-shepherd",
          "commit-suggestions",
          "42",
          "--thread-ids",
          "PRRT_x,PRRT_y",
        ],
      },
      instructions: [
        "Run the `commit-suggestions:` command above — it applies all reviewer suggestion blocks server-side as a single commit and resolves the threads.",
        "Run `git pull --ff-only` to sync your local checkout with the new commit before any further edits.",
      ],
    };
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();

    // Heading is the new shortcut variant — never the rebase-and-push variant.
    expect(out).toContain("# PR #42 [FIX_CODE]");
    expect(out).toContain("## Review threads");
    expect(out).toContain("## Commit suggestions");
    expect(out).not.toContain("## Post-fix push");
    expect(out).not.toContain("## Rebase");
    // No ceremony sections from the rebase-and-push path.
    expect(out).not.toContain("## Actionable comments");
    expect(out).not.toContain("## Failing checks");
    expect(out).not.toContain("## Changes-requested reviews");
    expect(out).not.toContain("## Cancelled runs");
    // Bundle bullets — both wrapped in backticks for the monitor SKILL to extract.
    expect(out).toContain(
      "- commit-suggestions: `npx pr-shepherd commit-suggestions 42 --thread-ids PRRT_x,PRRT_y`",
    );
    expect(out).toContain("- after: `git pull --ff-only`");
    // Two-step numbered instructions.
    expect(out).toContain("1. Run the `commit-suggestions:` command above");
    expect(out).toContain("2. Run `git pull --ff-only`");
  });

  it("fix_code (commit-suggestions mode): JSON parity — fix.mode and argv round-trip", async () => {
    const result: IterateResult = {
      ...makeIterateResult("fix_code"),
    };
    if (result.action !== "fix_code") throw new Error("unreachable");
    result.fix = {
      mode: "commit-suggestions",
      threads: [
        {
          id: "PRRT_x",
          path: "src/foo.ts",
          line: 10,
          author: "reviewer",
          body: "use a const\n\n```suggestion\nconst x = 1;\n```",
        },
      ],
      commitSuggestionsCommand: {
        argv: ["npx", "pr-shepherd", "commit-suggestions", "42", "--thread-ids", "PRRT_x"],
      },
      instructions: ["one", "two"],
    };
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42", "--format", "json"]);
    const parsed = JSON.parse(getStdout().trimEnd());
    expect(parsed.action).toBe("fix_code");
    expect(parsed.fix.mode).toBe("commit-suggestions");
    expect(parsed.fix.commitSuggestionsCommand.argv).toEqual([
      "npx",
      "pr-shepherd",
      "commit-suggestions",
      "42",
      "--thread-ids",
      "PRRT_x",
    ]);
    expect(parsed.fix.instructions).toEqual(["one", "two"]);
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
