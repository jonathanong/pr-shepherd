import { describe, expect, it } from "vitest";
import {
  buildUnifiedDiff,
  getUnsafeSuggestionRangeReason,
} from "../../test-helpers/suggestions/patch.test-support.mts";

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
    {
      name: "insertion after a retained anchor",
      originalContent: "a\nanchor\nc\n",
      startLine: 2,
      endLine: 2,
      replacementLines: ["anchor", "inserted"],
    },
    {
      name: "insertion before a retained anchor",
      originalContent: "a\nanchor\nc\n",
      startLine: 2,
      endLine: 2,
      replacementLines: ["inserted", "anchor"],
    },
  ])("accepts a valid $name", ({ name: _name, ...input }) => {
    expect(getUnsafeSuggestionRangeReason(input)).toBeNull();
  });

  it("builds a replacement patch for an insertion after a retained anchor", () => {
    const input = {
      originalContent: "a\nanchor\nc\n",
      startLine: 2,
      endLine: 2,
      replacementLines: ["anchor", "inserted"],
    };

    expect(getUnsafeSuggestionRangeReason(input)).toBeNull();
    expect(buildUnifiedDiff({ path: "f.ts", ...input })).toContain("-anchor\n+anchor\n+inserted\n");
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

  it("rejects a retained anchor followed by an apparent rewrite of the adjacent line", () => {
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
    ).toContain("appears to rewrite source immediately after");
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

  it("normalizes CRLF while detecting an apparent adjacent rewrite", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: "anchor\r\nconst value = computeOriginalThing();\r\n",
        startLine: 1,
        endLine: 1,
        replacementLines: ["anchor", "const value = computeUpdatedThing();"],
      }),
    ).toContain("appears to rewrite source immediately after");
  });

  it("treats an LF-only blank file as one replaceable line", () => {
    const input = {
      originalContent: "\n",
      startLine: 1,
      endLine: 1,
      replacementLines: ["filled"],
    };

    expect(getUnsafeSuggestionRangeReason(input)).toBeNull();
    expect(
      buildUnifiedDiff({
        path: "blank.txt",
        ...input,
      }),
    ).toContain("@@ -1,1 +1,1 @@\n-\n+filled\n");
  });
});
