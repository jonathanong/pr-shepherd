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
import { runIterate } from "./commands/iterate.mts";
import { runStatus } from "./commands/status.mts";
import type { IterateResult } from "./types.mts";

const mockRunIterate = vi.mocked(runIterate);
const mockRunStatus = vi.mocked(runStatus);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stdoutSpy: any;
let stderrSpy: any;

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
// formatIterateResult — fix_code actions and ## Checks section
// ---------------------------------------------------------------------------

describe("main — iterate text format (fix_code and checks)", () => {
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

  it("## Checks section renders in wait/cancel/rerun_ci actions when checks is non-empty", async () => {
    const result = makeIterateResult("wait");
    result.checks = [
      {
        name: "lint",
        conclusion: "SUCCESS",
        runId: "run-1",
        detailsUrl: "https://github.com/owner/repo/actions/runs/1",
      },
      {
        name: "test",
        conclusion: "FAILURE",
        runId: "run-2",
        detailsUrl: "https://github.com/owner/repo/actions/runs/2",
        failureKind: "actionable",
        failedStep: "Run tests",
      },
    ] as import("./types.mts").RelevantCheck[];
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();

    // ## Checks section present before ## Instructions
    const checksIdx = out.indexOf("## Checks");
    const instrIdx = out.indexOf("## Instructions");
    expect(checksIdx).toBeGreaterThan(-1);
    expect(instrIdx).toBeGreaterThan(checksIdx);

    // Passing check: ✓ bullet
    expect(out).toContain("- ✓ `lint` — SUCCESS");
    // Failing check: ✗ bullet with failureKind, conclusion, runId
    expect(out).toContain("- ✗ `test` (actionable) — FAILURE · `run-2`");
    // failedStep rendered as blockquote
    expect(out).toContain("  > Run tests");
  });

  it("## Checks — external detailsUrl renders `external` prefix; no-ID renders `(no runId)`", async () => {
    const result = makeIterateResult("wait");
    result.checks = [
      {
        name: "codecov/patch",
        conclusion: "FAILURE",
        runId: null,
        detailsUrl: "https://app.codecov.io/gh/owner/repo/pull/42",
        failureKind: "actionable",
      },
      {
        name: "mystery",
        conclusion: "FAILURE",
        runId: null,
        detailsUrl: null,
        failureKind: "cancelled",
      },
    ] as import("./types.mts").RelevantCheck[];
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();

    expect(out).toContain(
      "- ✗ `codecov/patch` (actionable) — FAILURE · external `https://app.codecov.io/gh/owner/repo/pull/42`",
    );
    expect(out).toContain("- ✗ `mystery` (cancelled) — FAILURE · (no runId)");
  });

  it("## Checks section renders in rerun_ci, mark_ready, cancel, rebase, escalate, fix_code when checks is non-empty", async () => {
    const passingCheck: import("./types.mts").RelevantCheck = {
      name: "lint",
      conclusion: "SUCCESS",
      runId: "run-1",
      detailsUrl: null,
    };
    // Test each action that had an uncovered checksSection TRUE branch.
    for (const action of [
      "rerun_ci",
      "mark_ready",
      "cancel",
      "rebase",
      "escalate",
      "fix_code",
    ] as const) {
      const result = makeIterateResult(action);
      result.checks = [passingCheck];
      mockRunIterate.mockResolvedValue(result as IterateResult);
      await main(["node", "shepherd", "iterate", "42"]);
      const out = getStdout();
      expect(out).toContain("## Checks");
      expect(out).toContain("- ✓ `lint` — SUCCESS");
    }
  });

  it("## Checks — failing check with no failureKind omits kind suffix", async () => {
    const result = makeIterateResult("wait");
    result.checks = [
      {
        name: "external-check",
        conclusion: "FAILURE",
        runId: null,
        detailsUrl: "https://example.com",
        // no failureKind — exercises the `c.failureKind ? ...` false branch
      } as import("./types.mts").RelevantCheck,
    ];
    mockRunIterate.mockResolvedValue(result);
    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    // No kind suffix in parens when failureKind is absent
    expect(out).toContain("- ✗ `external-check` — FAILURE · external `https://example.com`");
    expect(out).not.toContain("(undefined)");
  });
});
