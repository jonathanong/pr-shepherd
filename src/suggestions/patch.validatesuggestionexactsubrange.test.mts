import { describe, expect, it } from "vitest";
import { getUnsafeSuggestionRangeReason } from "../../test-helpers/suggestions/patch.test-support.mts";

const exactAdjacentBlock = [
  "const firstValue = computeOriginalVeryLongThing();",
  "const secondValue = computeAnotherOriginalThing();",
];

describe("getUnsafeSuggestionRangeReason — exact replacement subranges", () => {
  it.each([
    {
      name: "before the anchor",
      originalContent: `${exactAdjacentBlock.join("\n")}\nanchor\n`,
      startLine: 3,
      replacementLines: ["prepare();", ...exactAdjacentBlock, "finish();"],
      reason: "partially rewrites a source block before",
    },
    {
      name: "after the anchor",
      originalContent: `anchor\n${exactAdjacentBlock.join("\n")}\n`,
      startLine: 1,
      replacementLines: ["prepare();", ...exactAdjacentBlock, "finish();"],
      reason: "partially rewrites a source block after",
    },
    {
      name: "before a retained anchor",
      originalContent: `${exactAdjacentBlock.join("\n")}\nanchor\n`,
      startLine: 3,
      replacementLines: ["prepare();", ...exactAdjacentBlock, "finish();", "anchor"],
      reason: "appears to rewrite source immediately before",
    },
    {
      name: "after a retained anchor",
      originalContent: `anchor\n${exactAdjacentBlock.join("\n")}\n`,
      startLine: 1,
      replacementLines: ["anchor", "prepare();", ...exactAdjacentBlock, "finish();"],
      reason: "appears to rewrite source immediately after",
    },
  ])("rejects a padded exact adjacent block $name", ({ reason, ...input }) => {
    expect(getUnsafeSuggestionRangeReason({ ...input, endLine: input.startLine })).toContain(
      reason,
    );
  });

  it("accepts a padded exact adjacent block containing only delimiters", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: "{\n}\nanchor\n",
        startLine: 3,
        endLine: 3,
        replacementLines: ["prepare();", "{", "}", "finish();"],
      }),
    ).toBeNull();
  });
});
