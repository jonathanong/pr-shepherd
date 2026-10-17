import { describe, it, expect } from "vitest";
import type { FirstLookThread, FirstLookComment } from "../types/report.mts";
import { formatTriageResult } from "./triage-formatter.mts";
import { makeIterateResult } from "../../fixtures/cli-parser.iterate-fixtures.mts";
import type { IterateResult } from "../types.mts";

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
  authorType: "Unknown" as const,
  body: "old comment",
  url: "",
  createdAtUnix: 0,
  firstLookStatus: "outdated",
  autoResolved: true,
};

const FL_COMMENT: FirstLookComment = {
  id: "PRRC_fl1",
  isMinimized: true,
  author: "bot",
  authorType: "Unknown" as const,
  body: "quota warning",
  url: "",
  createdAtUnix: 0,
  firstLookStatus: "minimized",
};

describe("## First-look items — edited flag rendering", () => {
  it("renders [status: outdated, auto-resolved, edited] for an edited+autoResolved thread", () => {
    const editedThread: FirstLookThread = { ...FL_THREAD_OUTDATED_AUTO, edited: true };
    const result: IterateResult = { ...makeIterateResult("triage") };
    if (result.action !== "triage") throw new Error("unreachable");
    result.triage = { ...result.triage, firstLookThreads: [editedThread], firstLookComments: [] };
    const output = formatTriageResult("# PR #42 [TRIAGE]", result);
    expect(output).toContain("[status: outdated, auto-resolved, edited]");
  });

  it("renders [status: minimized, edited] for an edited comment", () => {
    const editedComment: FirstLookComment = { ...FL_COMMENT, edited: true };

    const iterResult: IterateResult = { ...makeIterateResult("triage") };
    if (iterResult.action !== "triage") throw new Error("unreachable");
    iterResult.triage = { ...iterResult.triage, firstLookComments: [editedComment] };
    expect(formatTriageResult("# PR #42 [TRIAGE]", iterResult)).toContain(
      "[status: minimized, edited]",
    );
  });
});
