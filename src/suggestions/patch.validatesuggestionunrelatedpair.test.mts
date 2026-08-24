import { describe, expect, it } from "vitest";
import { getUnsafeSuggestionRangeReason } from "../../test-helpers/suggestions/patch.test-support.mts";

const original = "const firstValue = computeOriginalVeryLongThing();";
const updated = "const firstValue = computeUpdatedVeryLongThing();";
const unrelatedSource = "runLegacyTailWithOriginalPayload();";
const unrelatedReplacement = "executeCompletelyDifferentReplacementPath();";

describe("getUnsafeSuggestionRangeReason — unrelated paired line", () => {
  it("rejects a changed line paired with an unrelated substantive line before the anchor", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: `${original}\n${unrelatedSource}\nanchor\n`,
        startLine: 3,
        endLine: 3,
        replacementLines: [updated, unrelatedReplacement],
      }),
    ).toContain("partially rewrites a source block before");
  });

  it("rejects a changed line paired with an unrelated substantive line after the anchor", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: `anchor\n${unrelatedSource}\n${original}\n`,
        startLine: 1,
        endLine: 1,
        replacementLines: [unrelatedReplacement, updated],
      }),
    ).toContain("partially rewrites a source block after");
  });

  it("accepts a near-copy aligned to the wrong adjacent source line", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: `${original}\n${unrelatedSource}\nanchor\n`,
        startLine: 3,
        endLine: 3,
        replacementLines: [unrelatedReplacement, updated],
      }),
    ).toBeNull();
  });
});
