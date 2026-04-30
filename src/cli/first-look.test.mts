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
