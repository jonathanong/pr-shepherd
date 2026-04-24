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

  it("--cooldown-seconds passes parsed value to runIterate", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("wait"));
    await main(["node", "shepherd", "iterate", "42", "--cooldown-seconds", "120"]);
    expect(mockRunIterate).toHaveBeenCalledWith(expect.objectContaining({ cooldownSeconds: 120 }));
  });
});

// ---------------------------------------------------------------------------
// formatIterateResult — text output shape: simple actions
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

  it("## Checks section is absent when checks is empty (cooldown keeps no-checks invariant)", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("cooldown")); // checks: []
    await main(["node", "shepherd", "iterate", "42"]);
    expect(getStdout()).not.toContain("## Checks");
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
