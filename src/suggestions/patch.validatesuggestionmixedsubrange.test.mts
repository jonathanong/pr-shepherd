import { describe, expect, it } from "vitest";
import { getUnsafeSuggestionRangeReason } from "../../test-helpers/suggestions/patch.test-support.mts";

const originalFirst = "const firstValue = computeOriginalVeryLongThing();";
const updatedFirst = "const firstValue = computeUpdatedVeryLongThing();";
const stableSecond = "const secondValue = preserveStableVeryLongThing();";
const stableThird = "const thirdValue = preserveAnotherVeryLongThing();";

describe("getUnsafeSuggestionRangeReason — mixed replacement subranges", () => {
  it("rejects a changed line followed by exact adjacent context before the anchor", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: `${originalFirst}\n${stableSecond}\nanchor\n`,
        startLine: 3,
        endLine: 3,
        replacementLines: ["prepare();", updatedFirst, stableSecond, "finish();"],
      }),
    ).toContain("partially rewrites a source block before");
  });

  it("rejects exact adjacent context followed by a changed line after the anchor", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: `anchor\n${stableSecond}\n${originalFirst}\n`,
        startLine: 1,
        endLine: 1,
        replacementLines: ["prepare();", stableSecond, updatedFirst, "finish();"],
      }),
    ).toContain("partially rewrites a source block after");
  });

  it("accepts an exact line paired with an unrelated changed boundary", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: `alpha original boundary\n${stableSecond}\nanchor\n`,
        startLine: 3,
        endLine: 3,
        replacementLines: ["prepare();", "zeta replacement opening", stableSecond, "finish();"],
      }),
    ).toBeNull();
  });

  it("rejects strong mixed evidence within a larger changed window", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: `${originalFirst}\n${stableSecond}\n${stableThird}\nanchor\n`,
        startLine: 4,
        endLine: 4,
        replacementLines: [
          "prepare();",
          updatedFirst,
          stableSecond,
          "const unrelated = buildCompletelyDifferentPayload();",
          "finish();",
        ],
      }),
    ).toContain("partially rewrites a source block before");
  });

  it("accepts non-adjacent mixed evidence", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent:
          `${originalFirst}\nconst sourceBoundary = keepOriginalPayload();\n` +
          `${stableThird}\nanchor\n`,
        startLine: 4,
        endLine: 4,
        replacementLines: [
          "prepare();",
          updatedFirst,
          "totallyDifferentOperationWithoutOverlap();",
          stableThird,
          "finish();",
        ],
      }),
    ).toBeNull();
  });

  it("rejects a mixed rewrite after a retained internal anchor", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: `anchor\n${stableSecond}\n${originalFirst}\n`,
        startLine: 1,
        endLine: 1,
        replacementLines: [
          "inserted before anchor",
          "anchor",
          "prepare();",
          stableSecond,
          updatedFirst,
          "finish();",
        ],
      }),
    ).toContain("appears to rewrite source immediately after");
  });

  it("rejects a mixed rewrite before a retained internal anchor", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: `${originalFirst}\n${stableSecond}\nanchor\n`,
        startLine: 3,
        endLine: 3,
        replacementLines: [
          "prepare();",
          updatedFirst,
          stableSecond,
          "finish();",
          "anchor",
          "inserted after anchor",
        ],
      }),
    ).toContain("appears to rewrite source immediately before");
  });
});
