import { describe, it, expect } from "vitest";
import type { FirstLookThread, FirstLookComment } from "../types/report.mts";
import { formatFetchResult } from "./formatters.mts";
import { formatFixCodeResult } from "./fix-formatter.mts";
import { formatText } from "../reporters/text.mts";
import { makeIterateResult } from "../cli-parser.iterate-fixtures.mts";
import type { IterateResult, ShepherdReport } from "../types.mts";

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

describe("## First-look items — edited flag rendering", () => {
  it("renders [status: outdated, auto-resolved, edited] for an edited+autoResolved thread", () => {
    const editedThread: FirstLookThread = { ...FL_THREAD_OUTDATED_AUTO, edited: true };
    const result: IterateResult = { ...makeIterateResult("fix_code") };
    if (result.action !== "fix_code") throw new Error("unreachable");
    result.fix = { ...result.fix, firstLookThreads: [editedThread], firstLookComments: [] };
    const output = formatFixCodeResult("# PR #42 [FIX_CODE]", result);
    expect(output).toContain("[status: outdated, auto-resolved, edited]");
  });

  it("renders [status: minimized, edited] for an edited comment across all 3 formatters", () => {
    const editedComment: FirstLookComment = { ...FL_COMMENT, edited: true };

    // fix-formatter
    const iterResult: IterateResult = { ...makeIterateResult("fix_code") };
    if (iterResult.action !== "fix_code") throw new Error("unreachable");
    iterResult.fix = { ...iterResult.fix, firstLookComments: [editedComment] };
    expect(formatFixCodeResult("# PR #42 [FIX_CODE]", iterResult)).toContain(
      "[status: minimized, edited]",
    );

    // resolve --fetch formatter
    expect(
      formatFetchResult({
        prNumber: 42,
        actionableThreads: [],
        actionableComments: [],
        firstLookThreads: [],
        firstLookComments: [editedComment],
        changesRequestedReviews: [],
        reviewSummaries: [],
        commitSuggestionsEnabled: false,
        instructions: [],
      }),
    ).toContain("[status: minimized, edited]");

    // check text formatter
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
      threads: { actionable: [], autoResolved: [], autoResolveErrors: [], firstLook: [] },
      comments: { actionable: [], firstLook: [editedComment] },
      changesRequestedReviews: [],
      reviewSummaries: [],
      firstLookSummaries: [],
      editedSummaries: [],
      approvedReviews: [],
    };
    expect(formatText(report)).toContain("[status: minimized, edited]");
  });
});

describe("## Review summaries (edited since first look) — fix-formatter rendering", () => {
  it("renders the edited-summaries section when editedSummaries is non-empty", () => {
    const editedSummary = { id: "PRR_ED", author: "reviewer", body: "Updated review comment." };
    const iterResult: IterateResult = { ...makeIterateResult("fix_code") };
    if (iterResult.action !== "fix_code") throw new Error("unreachable");
    iterResult.fix = { ...iterResult.fix, editedSummaries: [editedSummary] };
    const output = formatFixCodeResult("# PR #42 [FIX_CODE]", iterResult);
    expect(output).toContain(
      "## Review summaries (edited since first look — already minimized; do not re-minimize)",
    );
    expect(output).toContain("Updated review comment.");
    expect(output).toContain("PRR_ED");
  });
});

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
      firstLookSummaries: [],
      editedSummaries: [],
      approvedReviews: [],
    };
    const siteC = extractFirstLookSection(formatText(report));

    expect(siteA).toBe(siteB);
    expect(siteA).toBe(siteC);
  });
});
