import { describe, it, expect } from "vitest";
import { firstLine, renderFirstLookItems } from "./first-look.mts";
import type { FirstLookThread, FirstLookComment } from "../types/report.mts";
import { formatFetchResult } from "./formatters.mts";
import { formatFixCodeResult } from "./fix-formatter.mts";
import { formatText } from "../reporters/text.mts";
import { makeIterateResult } from "../cli-parser.iterate-fixtures.mts";
import type { IterateResult, ShepherdReport } from "../types.mts";

// ---------------------------------------------------------------------------
// firstLine helper
// ---------------------------------------------------------------------------

describe("firstLine", () => {
  it("returns the first line trimmed and sliced to 120 chars", () => {
    const long = " " + "x".repeat(200);
    expect(firstLine(long)).toBe("x".repeat(120));
  });

  it("stops at the first newline", () => {
    expect(firstLine("hello\nworld")).toBe("hello");
  });

  it("handles empty string", () => {
    expect(firstLine("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// renderFirstLookItems helper
// ---------------------------------------------------------------------------

describe("renderFirstLookItems", () => {
  const baseThread: FirstLookThread = {
    id: "PRRT_1",
    isResolved: false,
    isOutdated: true,
    isMinimized: false,
    path: "src/foo.ts",
    line: 10,
    startLine: null,
    author: "alice",
    body: "please fix this",
    url: "",
    createdAtUnix: 0,
    firstLookStatus: "outdated",
  };

  const baseComment: FirstLookComment = {
    id: "PRRC_1",
    isMinimized: true,
    author: "bob",
    body: "nit comment",
    url: "",
    createdAtUnix: 0,
    firstLookStatus: "minimized",
  };

  it("returns null when both arrays are empty", () => {
    expect(renderFirstLookItems([], [])).toBeNull();
  });

  it("includes count and policy-hint suffix in heading", () => {
    const out = renderFirstLookItems([baseThread], [baseComment])!;
    expect(out).toContain("## First-look items (2) — already closed on GitHub; acknowledge only");
  });

  it("thread bullet uses backtick-wrapped threadId= prefix", () => {
    const out = renderFirstLookItems([baseThread], [])!;
    expect(out).toContain("`threadId=PRRT_1`");
  });

  it("thread bullet includes backtick-wrapped path:line location", () => {
    const out = renderFirstLookItems([baseThread], [])!;
    expect(out).toContain("`src/foo.ts:10`");
  });

  it("thread bullet shows (no location) when path is null", () => {
    const t: FirstLookThread = { ...baseThread, path: null, line: null };
    const out = renderFirstLookItems([t], [])!;
    expect(out).toContain("(no location)");
    expect(out).not.toContain("`null");
  });

  it("thread bullet shows path:? when line is null", () => {
    const t: FirstLookThread = { ...baseThread, line: null };
    const out = renderFirstLookItems([t], [])!;
    expect(out).toContain("`src/foo.ts:?`");
  });

  it("thread bullet shows [status: outdated] for outdated non-autoResolved", () => {
    const out = renderFirstLookItems([{ ...baseThread, firstLookStatus: "outdated" }], [])!;
    expect(out).toContain("[status: outdated]");
    expect(out).not.toContain("auto-resolved");
  });

  it("thread bullet shows [status: outdated, auto-resolved] when autoResolved is true", () => {
    const t: FirstLookThread = { ...baseThread, firstLookStatus: "outdated", autoResolved: true };
    const out = renderFirstLookItems([t], [])!;
    expect(out).toContain("[status: outdated, auto-resolved]");
  });

  it("thread bullet shows [status: resolved] for resolved threads", () => {
    const t: FirstLookThread = { ...baseThread, firstLookStatus: "resolved" };
    const out = renderFirstLookItems([t], [])!;
    expect(out).toContain("[status: resolved]");
  });

  it("thread bullet shows [status: minimized] for minimized threads", () => {
    const t: FirstLookThread = { ...baseThread, firstLookStatus: "minimized" };
    const out = renderFirstLookItems([t], [])!;
    expect(out).toContain("[status: minimized]");
  });

  it("thread body appears on continuation line indented with two spaces", () => {
    const out = renderFirstLookItems([baseThread], [])!;
    expect(out).toContain("\n  please fix this");
  });

  it("thread body is trimmed and sliced to 120 chars", () => {
    const longBody = "  " + "y".repeat(200) + "\nsecond line";
    const t: FirstLookThread = { ...baseThread, body: longBody };
    const out = renderFirstLookItems([t], [])!;
    expect(out).toContain("\n  " + "y".repeat(120));
    expect(out).not.toContain("second line");
  });

  it("comment bullet uses backtick-wrapped commentId= prefix", () => {
    const out = renderFirstLookItems([], [baseComment])!;
    expect(out).toContain("`commentId=PRRC_1`");
  });

  it("comment bullet always shows [status: minimized]", () => {
    const out = renderFirstLookItems([], [baseComment])!;
    expect(out).toContain("[status: minimized]");
  });

  it("comment body appears on continuation line", () => {
    const out = renderFirstLookItems([], [baseComment])!;
    expect(out).toContain("\n  nit comment");
  });

  it("threads appear before comments", () => {
    const out = renderFirstLookItems([baseThread], [baseComment])!;
    expect(out.indexOf("threadId=")).toBeLessThan(out.indexOf("commentId="));
  });

  it("heading is followed by a blank line before bullets", () => {
    const out = renderFirstLookItems([baseThread], [])!;
    expect(out).toMatch(/## First-look items.*\n\n-/);
  });
});

// ---------------------------------------------------------------------------
// Cross-call-site identity assertion (issue #127 acceptance criterion)
//
// All three formatters must emit a byte-equal ## First-look items section
// for the same input.
// ---------------------------------------------------------------------------

const FL_THREAD_OUTDATED_AUTO: FirstLookThread = {
  id: "PRRT_fl1",
  isResolved: false,
  isOutdated: true,
  isMinimized: false,
  path: "src/bar.ts",
  line: 7,
  startLine: null,
  author: "alice",
  body: "old comment",
  url: "",
  createdAtUnix: 0,
  firstLookStatus: "outdated",
  autoResolved: true,
};

const FL_THREAD_RESOLVED: FirstLookThread = {
  id: "PRRT_fl2",
  isResolved: true,
  isOutdated: false,
  isMinimized: false,
  path: "src/baz.ts",
  line: 3,
  startLine: null,
  author: "bob",
  body: "already addressed",
  url: "",
  createdAtUnix: 0,
  firstLookStatus: "resolved",
};

const FL_COMMENT: FirstLookComment = {
  id: "PRRC_fl1",
  isMinimized: true,
  author: "bot",
  body: "quota warning",
  url: "",
  createdAtUnix: 0,
  firstLookStatus: "minimized",
};

function extractFirstLookSection(output: string): string {
  const start = output.indexOf("## First-look items");
  if (start === -1) throw new Error("## First-look items section not found in output");
  const nextSection = output.indexOf("\n## ", start + 1);
  return nextSection === -1
    ? output.slice(start).trimEnd()
    : output.slice(start, nextSection).trimEnd();
}

describe("## First-look items — cross-call-site consistency", () => {
  it("all three formatters render an identical section for the same input", () => {
    // Site A: formatFixCodeResult (iterate fix_code)
    const iterateResult: IterateResult = {
      ...makeIterateResult("fix_code"),
    };
    if (iterateResult.action !== "fix_code") throw new Error("unreachable");
    iterateResult.fix = {
      ...iterateResult.fix,
      firstLookThreads: [FL_THREAD_OUTDATED_AUTO, FL_THREAD_RESOLVED],
      firstLookComments: [FL_COMMENT],
    };
    const siteA = extractFirstLookSection(
      formatFixCodeResult("# PR #42 [FIX_CODE]", iterateResult),
    );

    // Site B: formatFetchResult (resolve --fetch)
    const siteB = extractFirstLookSection(
      formatFetchResult({
        prNumber: 42,
        actionableThreads: [],
        actionableComments: [],
        firstLookThreads: [FL_THREAD_OUTDATED_AUTO, FL_THREAD_RESOLVED],
        firstLookComments: [FL_COMMENT],
        changesRequestedReviews: [],
        reviewSummaries: [],
        commitSuggestionsEnabled: false,
        instructions: [],
      }),
    );

    // Site C: formatText (check)
    const report: ShepherdReport = {
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
        reviewDecision: null,
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
      threads: {
        actionable: [],
        autoResolved: [],
        autoResolveErrors: [],
        firstLook: [FL_THREAD_OUTDATED_AUTO, FL_THREAD_RESOLVED],
      },
      comments: { actionable: [], firstLook: [FL_COMMENT] },
      changesRequestedReviews: [],
      reviewSummaries: [],
      approvedReviews: [],
    };
    const siteC = extractFirstLookSection(formatText(report));

    expect(siteA).toBe(siteB);
    expect(siteA).toBe(siteC);
  });
});
