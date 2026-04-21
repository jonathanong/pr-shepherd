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

  it("fix_code (empty payload): heading + base/summary + Rebase section only (no items, no Instructions)", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("fix_code"));
    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toContain("# PR #42 [FIX_CODE]");
    expect(out).toContain("## Rebase");
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

    // Section ordering: threads → comments → checks → reviews → noise → cancelled → Rebase → Instructions.
    const order = [
      "## Review threads",
      "## Actionable comments",
      "## Failing checks",
      "## Changes-requested reviews",
      "## Noise (minimize only)",
      "## Cancelled runs",
      "## Rebase",
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
    // Rebase section uses backticked base + resolve command with --require-sha appended.
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
    if (result.action !== "fix_code") throw new Error("unreachable");
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
