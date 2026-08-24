import { describe, expect, it } from "vitest";
import { getUnsafeSuggestionRangeReason } from "../../test-helpers/suggestions/patch.test-support.mts";

describe("getUnsafeSuggestionRangeReason", () => {
  it.each([
    {
      name: "single-line replacement",
      originalContent: "a\nb\nc\n",
      startLine: 2,
      endLine: 2,
      replacementLines: ["B"],
    },
    {
      name: "multi-line replacement",
      originalContent: "a\nb\nc\nd\n",
      startLine: 2,
      endLine: 3,
      replacementLines: ["B", "C"],
    },
    {
      name: "deletion",
      originalContent: "a\nb\nc\n",
      startLine: 2,
      endLine: 2,
      replacementLines: [],
    },
    {
      name: "one-to-many replacement that does not replay the anchor",
      originalContent: "a\nb\nc\n",
      startLine: 2,
      endLine: 2,
      replacementLines: ["B", "inserted"],
    },
  ])("accepts a valid $name", ({ name: _name, ...input }) => {
    expect(getUnsafeSuggestionRangeReason(input)).toBeNull();
  });

  it("keeps exact outside-context trimming compatible with issue #294", () => {
    const originalContent =
      ["finish({", "  code: a,", "  retryable: b,", "  isStall: x,", "  hung,", "})"].join("\n") +
      "\n";

    expect(
      getUnsafeSuggestionRangeReason({
        originalContent,
        startLine: 4,
        endLine: 4,
        replacementLines: ["  code: a,", "  retryable: b,", "  isStall: y,", "  hung,"],
      }),
    ).toBeNull();
  });

  it("rejects a replacement that replays the complete anchor and extends past it", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent:
          "  { loading: PodcastsLoading, name: 'podcasts' },\n" +
          "  { loading: PostsLoading, name: 'posts' },\n",
        startLine: 1,
        endLine: 1,
        replacementLines: [
          "  { loading: PodcastsLoading, name: 'podcasts' },",
          "  { loading: PostsLoading, name: 'posts', showFooter: undefined },",
        ],
      }),
    ).toContain("reproduces the complete anchored range");
  });

  it("rejects a partial rewrite of a same-sized block before the anchor", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent:
          [
            "const skeletons: Array<{",
            "  component: ComponentType",
            "  count: number",
            "  name: string",
            "}> = [",
            "  { component: AsideSkeleton, count: 4, name: 'aside' },",
          ].join("\n") + "\n",
        startLine: 6,
        endLine: 6,
        replacementLines: [
          "const skeletons: Array<{",
          "  component: ComponentType",
          "  count: number // derived from Skeleton primitives",
          "  name: string",
          "}> = [",
        ],
      }),
    ).toContain("partially rewrites a source block before");
  });

  it("rejects a partial rewrite of a same-sized block after the anchor", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: ["anchor", "{", "  first", "  old", "  last", "tail"].join("\n") + "\n",
        startLine: 1,
        endLine: 1,
        replacementLines: ["{", "  first", "  new", "  last"],
      }),
    ).toContain("partially rewrites a source block after");
  });

  it.each([
    { startLine: 0, endLine: 1 },
    { startLine: 2, endLine: 1 },
    { startLine: 1.5, endLine: 2 },
    { startLine: 1, endLine: 4 },
  ])("rejects invalid range $startLine-$endLine", ({ startLine, endLine }) => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: "a\nb\nc\n",
        startLine,
        endLine,
        replacementLines: ["A"],
      }),
    ).toContain("invalid or out-of-bounds range");
  });

  it("normalizes CRLF while detecting an anchored-range replay", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: "anchor\r\nnext\r\n",
        startLine: 1,
        endLine: 1,
        replacementLines: ["anchor", "replacement"],
      }),
    ).toContain("reproduces the complete anchored range");
  });
});
