import { describe, expect, it } from "vitest";
import { getUnsafeSuggestionRangeReason } from "../../test-helpers/suggestions/patch.test-support.mts";

describe("getUnsafeSuggestionRangeReason — replacement subranges", () => {
  it("rejects an adjacent rewrite hidden after an unrelated replacement line", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: "const value = computeOriginalThing();\nanchor\n",
        startLine: 2,
        endLine: 2,
        replacementLines: ["prepare();", "const value = computeUpdatedThing();"],
      }),
    ).toContain("partially rewrites a source block before");
  });

  it("rejects an adjacent rewrite hidden before an unrelated replacement line", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: "anchor\nconst value = computeOriginalThing();\n",
        startLine: 1,
        endLine: 1,
        replacementLines: ["const value = computeUpdatedThing();", "prepare();"],
      }),
    ).toContain("partially rewrites a source block after");
  });

  it("checks bounded-width candidates throughout a long replacement", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: "const value = computeOriginalThing();\nanchor\n",
        startLine: 2,
        endLine: 2,
        replacementLines: [
          ...Array.from({ length: 9 }, (_, index) => `unrelatedAddedLine${index}();`),
          "const value = computeUpdatedThing();",
        ],
      }),
    ).toContain("partially rewrites a source block before");
  });

  it("rejects a buried multi-line adjacent rewrite", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: "abcdefghXX\nYYmnopqrst\nanchor\n",
        startLine: 3,
        endLine: 3,
        replacementLines: ["prepare()", "abcdefghZZ", "WWmnopqrst"],
      }),
    ).toContain("partially rewrites a source block before");
  });

  it("rejects a buried multi-line rewrite after the anchor", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: "anchor\nabcdefghXX\nYYmnopqrst\n",
        startLine: 1,
        endLine: 1,
        replacementLines: ["abcdefghZZ", "WWmnopqrst", "prepare()"],
      }),
    ).toContain("partially rewrites a source block after");
  });
});

describe("getUnsafeSuggestionRangeReason — internal retained anchor", () => {
  it("rejects a rewrite after an internally retained anchor", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: "anchor\nconst value = computeOriginalThing();\n",
        startLine: 1,
        endLine: 1,
        replacementLines: ["inserted", "anchor", "const value = computeUpdatedThing();"],
      }),
    ).toContain("appears to rewrite source immediately after");
  });

  it("rejects a rewrite before an internally retained anchor", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: "const value = computeOriginalThing();\nanchor\n",
        startLine: 2,
        endLine: 2,
        replacementLines: ["const value = computeUpdatedThing();", "anchor", "inserted"],
      }),
    ).toContain("appears to rewrite source immediately before");
  });

  it("rejects rewrites on both sides of an internally retained anchor", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent:
          "const before = computeOriginalThing();\nanchor\nconst after = computeOriginalThing();\n",
        startLine: 2,
        endLine: 2,
        replacementLines: [
          "const before = computeUpdatedThing();",
          "anchor",
          "const after = computeUpdatedThing();",
        ],
      }),
    ).toContain("appears to rewrite source immediately after");
  });

  it("matches the complete multi-line anchor internally", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent:
          "const anchor = firstLine();\nreturn anchor;\nconst value = computeOriginalThing();\n",
        startLine: 1,
        endLine: 2,
        replacementLines: [
          "inserted",
          "const anchor = firstLine();",
          "return anchor;",
          "const value = computeUpdatedThing();",
        ],
      }),
    ).toContain("appears to rewrite source immediately after");
  });

  it("normalizes CRLF in an internal multi-line anchor", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent:
          "const anchor = firstLine();\r\nreturn anchor;\r\nconst value = computeOriginalThing();\r\n",
        startLine: 1,
        endLine: 2,
        replacementLines: [
          "inserted",
          "const anchor = firstLine();",
          "return anchor;",
          "const value = computeUpdatedThing();",
        ],
      }),
    ).toContain("appears to rewrite source immediately after");
  });

  it("checks every complete anchor occurrence", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: "const value = computeOriginalThing();\nanchor\n",
        startLine: 2,
        endLine: 2,
        replacementLines: [
          "anchor",
          "inserted",
          "const value = computeUpdatedThing();",
          "anchor",
          "tail",
        ],
      }),
    ).toContain("appears to rewrite source immediately before");
  });

  it("accepts unrelated insertions around an internally retained anchor", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: "existing before\nanchor\nexisting after\n",
        startLine: 2,
        endLine: 2,
        replacementLines: ["inserted before", "anchor", "inserted after"],
      }),
    ).toBeNull();
  });

  it("does not treat a partial multi-line anchor as retained", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent:
          "const anchor = firstLine();\nreturn anchor;\nconst existing = untouched();\n",
        startLine: 1,
        endLine: 2,
        replacementLines: ["return anchor;", "inserted replacement"],
      }),
    ).toBeNull();
  });

  it("fails closed when repeated anchors make extension scans excessive", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: "anchor\nexisting after\n",
        startLine: 1,
        endLine: 1,
        replacementLines: Array.from({ length: 65 }, () => "anchor"),
      }),
    ).toContain("repeats the complete anchored range too many times");
  });

  it("allows repeated-anchor work at the exact validation cap", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: "anchor\nunrelated after\n",
        startLine: 1,
        endLine: 1,
        replacementLines: Array.from({ length: 64 }, () => "anchor"),
      }),
    ).toBeNull();
  });
});
