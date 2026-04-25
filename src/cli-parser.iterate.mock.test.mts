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
import type { CancelReason, IterateResult } from "./types.mts";
import { makeIterateResult } from "./cli-parser.iterate-fixtures.mts";

const mockRunIterate = vi.mocked(runIterate);
const mockRunStatus = vi.mocked(runStatus);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stdoutSpy: any;
let stderrSpy: any;

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
  it("cooldown (default): only heading, log, and ## Instructions — no base/summary lines", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("cooldown"));
    await main(["node", "shepherd", "iterate", "42"]);
    const lines = getStdout().trimEnd().split("\n");
    expect(lines[0]).toBe("# PR #42 [COOLDOWN]");
    expect(lines[1]).toBe("");
    expect(lines[2]).toBe("SKIP: CI still starting");
    expect(lines[3]).toBe("");
    expect(lines[4]).toBe("## Instructions");
    expect(lines[5]).toBe("");
    expect(lines[6]).toMatch(/End this iteration/);
    // No base/summary lines in default mode
    expect(getStdout()).not.toContain("**status**");
    expect(getStdout()).not.toContain("**summary**");
  });

  it("cooldown (verbose): heading, full base/summary, log, then ## Instructions", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("cooldown"));
    await main(["node", "shepherd", "iterate", "42", "--verbose"]);
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

  it("mark_ready: heading includes [MARK_READY] tag and ## Instructions with end-iteration step", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("mark_ready"));
    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toContain("# PR #42 [MARK_READY]");
    expect(out).toContain("MARKED READY: PR 42");
    expect(out).toContain("## Instructions");
    expect(out).toContain("1. The CLI already marked the PR ready for review");
  });

  it("cancel: heading includes [CANCEL] tag with reason and ## Instructions with loop-cancel steps", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("cancel"));
    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toContain("# PR #42 [CANCEL]");
    expect(out).toContain("— ready-delay-elapsed");
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

  it("json format: emits a single JSON object+newline, no formatter output", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("wait"));
    await main(["node", "shepherd", "iterate", "42", "--format", "json"]);
    const out = getStdout().trimEnd();
    expect(() => JSON.parse(out)).not.toThrow();
    const parsed = JSON.parse(out);
    expect(parsed.action).toBe("wait");
    expect(parsed.pr).toBe(42);
  });

  it("cancel json: emits reason field so consumers can branch without parsing log", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("cancel"));
    await main(["node", "shepherd", "iterate", "42", "--format", "json"]);
    const parsed = JSON.parse(getStdout().trimEnd());
    expect(parsed.action).toBe("cancel");
    expect(parsed.reason).toBe("ready-delay-elapsed");
  });

  it("cancel text: each CancelReason value appears in the heading", async () => {
    const reasons: CancelReason[] = ["merged", "closed", "ready-delay-elapsed"];
    for (const reason of reasons) {
      const base = makeIterateResult("cancel") as Extract<IterateResult, { action: "cancel" }>;
      mockRunIterate.mockResolvedValue({ ...base, reason });
      await main(["node", "shepherd", "iterate", "42"]);
      const out = getStdout();
      expect(out).toContain(`# PR #42 [CANCEL] — ${reason}`);
    }
  });

  // ---------------------------------------------------------------------------
  // lean vs verbose output
  // ---------------------------------------------------------------------------

  it("lean mode (default): summary line omits zero counts, false booleans, and non-READY remainingSeconds", async () => {
    // fixture: status=IN_PROGRESS, remainingSeconds=60, copilotReviewInProgress=false, isDraft=false
    mockRunIterate.mockResolvedValue(makeIterateResult("wait"));
    await main(["node", "shepherd", "iterate", "42"]);
    const text = getStdout();
    // Zero counts omitted
    expect(text).not.toContain("skipped");
    expect(text).not.toContain("filtered");
    // False booleans omitted
    expect(text).not.toContain("shouldCancel");
    expect(text).not.toContain("copilotReviewInProgress");
    expect(text).not.toContain("isDraft");
    // remainingSeconds omitted when status != READY
    expect(text).not.toContain("remainingSeconds");
  });

  it("lean mode: remainingSeconds shown when status=READY and timer is positive", async () => {
    const result = {
      ...makeIterateResult("wait"),
      status: "READY" as const,
      remainingSeconds: 300,
    };
    mockRunIterate.mockResolvedValue(result);
    await main(["node", "shepherd", "iterate", "42"]);
    expect(getStdout()).toContain("**remainingSeconds** 300");
  });

  it("lean mode: copilotReviewInProgress and isDraft shown only when true", async () => {
    const result = {
      ...makeIterateResult("wait"),
      copilotReviewInProgress: true,
      isDraft: true,
    };
    mockRunIterate.mockResolvedValue(result);
    await main(["node", "shepherd", "iterate", "42"]);
    const text = getStdout();
    expect(text).toContain("**copilotReviewInProgress**");
    expect(text).toContain("**isDraft**");
  });

  it("verbose mode: summary line includes all fields including shouldCancel and false booleans", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("wait"));
    await main(["node", "shepherd", "iterate", "42", "--verbose"]);
    const text = getStdout();
    expect(text).toContain("shouldCancel");
    expect(text).toContain(`**remainingSeconds** 60`);
    expect(text).toContain("copilotReviewInProgress");
    expect(text).toContain("isDraft");
    expect(text).toContain("0 skipped");
    expect(text).toContain("0 filtered");
  });

  // Per CLAUDE.md output-format invariant: text and JSON must surface equivalent
  // information. In verbose mode every scalar base field is present in both formats.
  it("format parity (verbose): text output surfaces every scalar base field that JSON carries", async () => {
    const result = makeIterateResult("wait");
    mockRunIterate.mockResolvedValue(result);
    await main(["node", "shepherd", "iterate", "42", "--verbose"]);
    const text = getStdout();
    expect(text).toContain(`# PR #${result.pr}`);
    expect(text).toContain(`\`${result.status}\``);
    expect(text).toContain(`\`${result.mergeStateStatus}\``);
    expect(text).toContain(`\`${result.state}\``);
    expect(text).toContain(`${result.summary.passing} passing`);
    expect(text).toContain(`${result.summary.inProgress} inProgress`);
    expect(text).toContain(`**remainingSeconds** ${result.remainingSeconds}`);
  });

  it("json lean: omits shouldCancel, false booleans, and remainingSeconds when status != READY", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("wait"));
    await main(["node", "shepherd", "iterate", "42", "--format", "json"]);
    const parsed = JSON.parse(getStdout().trimEnd());
    expect(parsed.shouldCancel).toBeUndefined();
    expect(parsed.copilotReviewInProgress).toBeUndefined();
    expect(parsed.isDraft).toBeUndefined();
    expect(parsed.remainingSeconds).toBeUndefined();
    // checks omitted for wait action
    expect(parsed.checks).toBeUndefined();
  });

  it("json lean: summary omits zero counts", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("wait")); // skipped/filtered = 0
    await main(["node", "shepherd", "iterate", "42", "--format", "json"]);
    const parsed = JSON.parse(getStdout().trimEnd());
    expect(parsed.summary.skipped).toBeUndefined();
    expect(parsed.summary.filtered).toBeUndefined();
    expect(parsed.summary.inProgress).toBe(1); // non-zero, must be present
  });

  it("json verbose: emits full result with all fields including shouldCancel and false booleans", async () => {
    const result = makeIterateResult("wait");
    mockRunIterate.mockResolvedValue(result);
    await main(["node", "shepherd", "iterate", "42", "--format", "json", "--verbose"]);
    const parsed = JSON.parse(getStdout().trimEnd());
    expect(parsed.shouldCancel).toBe(false);
    expect(parsed.copilotReviewInProgress).toBe(false);
    expect(parsed.isDraft).toBe(false);
    expect(parsed.remainingSeconds).toBe(60);
    expect(parsed.summary.skipped).toBe(0);
    expect(parsed.summary.filtered).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // HAS_HOOKS — derived BLOCKED, raw HAS_HOOKS
  // ---------------------------------------------------------------------------

  it("text: reviewDecision shown in heading when mergeStatus=BLOCKED from HAS_HOOKS raw", async () => {
    const result = {
      ...makeIterateResult("wait"),
      mergeStateStatus: "HAS_HOOKS" as const,
      mergeStatus: "BLOCKED" as const,
      reviewDecision: "REVIEW_REQUIRED" as const,
    };
    mockRunIterate.mockResolvedValue(result);
    await main(["node", "shepherd", "iterate", "42", "--verbose"]);
    const text = getStdout();
    expect(text).toContain("**reviewDecision** `REVIEW_REQUIRED`");
  });

  it("text: reviewDecision omitted from heading when mergeStatus=BLOCKED+HAS_HOOKS but null", async () => {
    const result = {
      ...makeIterateResult("wait"),
      mergeStateStatus: "HAS_HOOKS" as const,
      mergeStatus: "BLOCKED" as const,
      reviewDecision: null,
    };
    mockRunIterate.mockResolvedValue(result);
    await main(["node", "shepherd", "iterate", "42", "--verbose"]);
    expect(getStdout()).not.toContain("reviewDecision");
  });

  it("json lean: reviewDecision included when mergeStatus=BLOCKED from HAS_HOOKS raw", async () => {
    const result = {
      ...makeIterateResult("wait"),
      mergeStateStatus: "HAS_HOOKS" as const,
      mergeStatus: "BLOCKED" as const,
      reviewDecision: "REVIEW_REQUIRED" as const,
    };
    mockRunIterate.mockResolvedValue(result);
    await main(["node", "shepherd", "iterate", "42", "--format", "json"]);
    const parsed = JSON.parse(getStdout().trimEnd());
    expect(parsed.reviewDecision).toBe("REVIEW_REQUIRED");
  });
});
