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
        resolutionOnlyThreads: [],
        actionableComments: [],
        firstLookThreads: [],
        firstLookComments: [editedComment],
        changesRequestedReviews: [],
        reviewSummaries: [],
        commitSuggestionsEnabled: false,
        instructions: [],
      }),
    ).toContain("[status: minimized, edited]");
  });
});

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

describe("formatFixCodeResult — fallback branches", () => {
  it("renders missing locations, missing check metadata, cancelled checks, and empty review bodies", () => {
    const iterResult: IterateResult = { ...makeIterateResult("fix_code") };
    if (iterResult.action !== "fix_code") throw new Error("unreachable");
    iterResult.fix = {
      ...iterResult.fix,
      threads: [
        {
          id: "T_NO_LOC",
          path: null,
          line: null,
          startLine: undefined,
          author: "alice",
          authorType: "User",
          body: "thread body",
          url: "",
        },
      ],
      checks: [
        {
          name: "external-check",
          conclusion: null,
          detailsUrl: "https://checks.example/1",
          runId: null,
        },
        {
          name: "cancelled-check",
          jobName: "cancelled-job",
          conclusion: "CANCELLED",
          detailsUrl: null,
          runId: null,
          failedStep: "should not render",
          summary: "should not render",
        },
      ],
      firstLookSummaries: [{ id: "R_EMPTY", author: "reviewer", authorType: "User", body: "   " }],
      editedSummaries: [{ id: "R_EDITED_EMPTY", author: "reviewer", authorType: "User", body: "" }],
    };

    const output = formatFixCodeResult("# PR #42 [FIX_CODE]", iterResult);

    expect(output).toContain("(no location)");
    expect(output).toContain("external `https://checks.example/1`");
    expect(output).toContain("[conclusion: CANCELLED]");
    expect(output).not.toContain("should not render");
    expect(output).toContain("(no review body)");
  });
});

describe("## First-look items — cross-call-site consistency", () => {
  it("formatFixCodeResult and formatFetchResult render an identical section for the same input", () => {
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
        resolutionOnlyThreads: [],
        actionableComments: [],
        firstLookThreads: [FL_THREAD_OUTDATED_AUTO, FL_THREAD_RESOLVED],
        firstLookComments: [FL_COMMENT],
        changesRequestedReviews: [],
        reviewSummaries: [],
        commitSuggestionsEnabled: false,
        instructions: [],
      }),
    );

    expect(siteA).toBe(siteB);
  });
});

describe("list and suggestion render helpers", () => {
  it("renders author, body preview, line ranges, and safe fences", () => {
    expect(renderAuthor("alice")).toBe("@alice");
    expect(renderBodyPreview("  first line  \r\nsecond")).toBe("first line");
    expect(renderBodyPreview("x".repeat(120))).toHaveLength(100);
    expect(renderLineRange(undefined, null)).toBe("?");
    expect(renderLineRange(2, 5)).toBe("2-5");
    expect(renderLineRange(5, 5)).toBe("5");
    expect(safeFence("no ticks")).toBe("```");
    expect(safeFence("````")).toBe("`````");
  });

  it("renders thread/comment/review bullets across optional branches", () => {
    expect(renderThreadResolutionStatusTag({})).toBe("[status: unresolved]");
    expect(renderThreadResolutionStatusTag({ isOutdated: true, isMinimized: true })).toBe(
      "[status: outdated, minimized]",
    );
    expect(
      renderThreadBullet({
        id: "T1",
        path: null,
        startLine: null,
        line: null,
        author: "alice",
        body: "body",
        suggestion: { startLine: 1, endLine: 1, lines: ["x"], author: "alice" },
      }),
    ).toContain("`(no location)`");
    expect(
      renderThreadBullet(
        {
          id: "T2",
          url: "https://example.com/t",
          path: "src/a.ts",
          startLine: 1,
          line: 2,
          author: "alice",
          authorType: "User",
          body: "body",
          suggestion: { startLine: 1, endLine: 2, lines: ["x"], author: "alice" },
        },
        { renderSuggestion: true, statusTag: "[status: unresolved]" },
      ),
    ).toContain("Replaces lines 1–2");
    expect(
      renderCommentBullet(
        { id: "C1", url: "https://example.com/c", author: "bot", body: "comment" },
        { statusTag: "[status: minimized]" },
      ),
    ).toContain("[↗](https://example.com/c)");
    expect(
      renderReviewBullet({ id: "R1", author: "reviewer", body: "" }, { includeBody: true }),
    ).not.toContain(": ");
    expect(
      renderReviewBullet({ id: "R2", author: "reviewer", body: "summary" }, { includeBody: true }),
    ).toContain(": summary");
  });

  it("renders review list sections only when non-empty", () => {
    expect(renderReviewListSection("Reviews", [])).toBeNull();
    expect(
      renderReviewListSection("Reviews", [{ id: "R1", author: "alice", body: "looks good" }]),
    ).toBe("## Reviews\n\n- `reviewId=R1` (@alice): looks good");
  });

  it("renders deletion, blank-line, and multiline suggestion blocks", () => {
    expect(renderSuggestionBlock({ startLine: 1, endLine: 1, lines: [], author: "a" })).toContain(
      "with nothing",
    );
    expect(renderSuggestionBlock({ startLine: 1, endLine: 1, lines: [""], author: "a" })).toContain(
      "with a blank line",
    );
    expect(
      renderSuggestionBlock({ startLine: 1, endLine: 2, lines: ["a", "b"], author: "a" }, ""),
    ).toContain("a\nb");
  });
});

describe("iterate fixture fallback", () => {
  it("falls back to wait for unknown actions at runtime", () => {
    const result = makeIterateResult("unknown" as never);
    expect(result.action).toBe("wait");
  });
});
