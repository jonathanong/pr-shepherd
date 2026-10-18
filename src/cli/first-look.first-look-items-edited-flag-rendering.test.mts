import { describe, it, expect } from "vitest";
import type { FirstLookComment, FirstLookThread } from "../types/report.mts";
import { formatFixCodeResult } from "./fix-formatter.mts";
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

describe("## First-look items — edited flag rendering", () => {
  it("renders [status: outdated, auto-resolved, edited] for an edited+autoResolved thread", () => {
    const editedThread: FirstLookThread = { ...FL_THREAD_OUTDATED_AUTO, edited: true };
    const result: IterateResult = { ...makeIterateResult("fix_code") };
    if (result.action !== "fix_code") throw new Error("unreachable");
    result.fix = { ...result.fix, firstLookThreads: [editedThread], firstLookComments: [] };
    const output = formatFixCodeResult("# PR #42 [FIX_CODE]", result);
    expect(output).toContain("[status: outdated, auto-resolved, edited]");
  });

  it("renders a first-look minimized comment as [status: minimized]", () => {
    const comment: FirstLookComment = {
      id: "IC_fl1",
      isMinimized: true,
      author: "coderabbitai",
      authorType: "Bot",
      body: "walkthrough",
      url: "",
      createdAtUnix: 0,
      firstLookStatus: "minimized",
    };
    const result: IterateResult = { ...makeIterateResult("fix_code") };
    if (result.action !== "fix_code") throw new Error("unreachable");
    result.fix = { ...result.fix, firstLookThreads: [], firstLookComments: [comment] };
    const output = formatFixCodeResult("# PR #42 [FIX_CODE]", result);
    expect(output).toContain("`commentId=IC_fl1`");
    expect(output).toContain("[status: minimized]");
  });
});
