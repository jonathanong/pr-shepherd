import { describe, expect, it } from "vitest";
import { getUnsafeSuggestionRangeReason } from "../../test-helpers/suggestions/patch.test-support.mts";

describe("getUnsafeSuggestionRangeReason — adjacent source", () => {
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

  it("rejects an apparent rewrite before a retained anchor", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent:
          "  { loading: PostsLoading, name: 'posts' },\n" +
          "  { loading: PodcastsLoading, name: 'podcasts' },\n",
        startLine: 2,
        endLine: 2,
        replacementLines: [
          "  { loading: PostsLoading, name: 'posts', showFooter: undefined },",
          "  { loading: PodcastsLoading, name: 'podcasts' },",
        ],
      }),
    ).toContain("appears to rewrite source immediately before");
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
        originalContent:
          [
            "anchor",
            "const skeletons: Array<{",
            "  component: ComponentType",
            "  count: number",
            "  name: string",
            "> = [",
          ].join("\n") + "\n",
        startLine: 1,
        endLine: 1,
        replacementLines: [
          "const skeletons: Array<{",
          "  component: ComponentType",
          "  count: number // derived from Skeleton primitives",
          "  name: string",
          "> = [",
        ],
      }),
    ).toContain("partially rewrites a source block after");
  });

  it("rejects a substantive two-line adjacent rewrite", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: "const value = computeOriginalThing();\ntail\nanchor\n",
        startLine: 3,
        endLine: 3,
        replacementLines: ["const value = computeUpdatedThing();", "tail"],
      }),
    ).toContain("partially rewrites a source block before");
  });

  it.each([
    {
      name: "matching block delimiters with unrelated content",
      originalContent: "{\nold\n}\nanchor\n",
      replacementLines: ["{", "new", "}"],
    },
    {
      name: "short two-line lookalike",
      originalContent: "A\nB\nanchor\n",
      replacementLines: ["A", "B2"],
    },
    {
      name: "exact adjacent context",
      originalContent: "const value = computeOriginalThing();\ntail\nanchor\n",
      replacementLines: ["const value = computeOriginalThing();", "tail"],
    },
  ])("accepts $name as an ordinary replacement", ({ name: _name, ...input }) => {
    const anchorLine = input.originalContent.split("\n").length - 1;
    expect(
      getUnsafeSuggestionRangeReason({
        ...input,
        startLine: anchorLine,
        endLine: anchorLine,
      }),
    ).toBeNull();
  });
});
