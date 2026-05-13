// @ts-nocheck
import { describe, it, expect } from "vitest";
import type { FirstLookThread, FirstLookComment } from "../types/report.mts";
import { formatFetchResult } from "./formatters.mts";
import { formatFixCodeResult } from "./fix-formatter.mts";
import { makeIterateResult } from "../cli-parser.iterate-fixtures.mts";
import type { IterateResult } from "../types.mts";
import {
  renderAuthor,
  renderBodyPreview,
  renderCommentBullet,
  renderReviewBullet,
  renderReviewListSection,
  renderThreadBullet,
  renderThreadResolutionStatusTag,
} from "./list-formatters.mts";
import { renderLineRange, renderSuggestionBlock } from "./suggestion-renderer.mts";
import { safeFence } from "./fence.mts";

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

const FL_THREAD_RESOLVED: FirstLookThread = {
  id: "PRRT_fl2",
  isResolved: true,
  isOutdated: false,
  isMinimized: false,
  path: "src/baz.ts",
  line: 3,
  startLine: null,
  author: "bob",
  authorType: "Unknown" as const,
  body: "already addressed",
  url: "",
  createdAtUnix: 0,
  firstLookStatus: "resolved",
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

function extractFirstLookSection(output: string): string {
  const start = output.indexOf("## First-look items");
  if (start === -1) throw new Error("## First-look items section not found in output");
  const nextSection = output.indexOf("\n## ", start + 1);
  return nextSection === -1
    ? output.slice(start).trimEnd()
    : output.slice(start, nextSection).trimEnd();
}

describe("## Review summaries (edited since first look) — fix-formatter rendering", () => {
  it("renders the edited-summaries section when editedSummaries is non-empty", () => {
    const editedSummary = {
      id: "PRR_ED",
      author: "reviewer",
      authorType: "Unknown" as const,
      body: "Updated review comment.",
    };
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
