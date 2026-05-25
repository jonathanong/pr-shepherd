import { describe, it, expect } from "vitest";
import {
  renderAuthor,
  renderBodyPreview,
  renderCommentBullet,
  renderEditedCommentTag,
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
      renderThreadBullet(
        {
          id: "T3",
          path: "src/a.ts",
          startLine: 1,
          line: 2,
          author: "alice",
          body: "body",
          comments: [
            {
              id: "C-thread",
              author: "alice",
              body: "body",
              url: "",
            },
          ],
          suggestion: { startLine: 1, endLine: 2, lines: ["x"], author: "alice" },
        },
        { renderSuggestion: true },
      ),
    ).toContain("Replaces lines 1–2");
    expect(
      renderCommentBullet(
        { id: "C1", url: "https://example.com/c", author: "bot", body: "comment" },
        { statusTag: "[status: minimized]" },
      ),
    ).toContain("[↗](https://example.com/c)");
    expect(renderEditedCommentTag({ edited: true })).toBe("[edited since first look]");
    expect(renderEditedCommentTag({})).toBeUndefined();
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
