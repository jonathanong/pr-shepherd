import { describe, expect, it } from "vitest";
import { getUnsafeSuggestionRangeReason } from "../../test-helpers/suggestions/patch.test-support.mts";

const original = "const firstValue = computeOriginalVeryLongThing();";
const updated = "const firstValue = computeUpdatedVeryLongThing();";
const unrelatedSource = "runLegacyTailWithOriginalPayload();";
const unrelatedReplacement = "executeCompletelyDifferentReplacementPath();";
const unrelatedSourceMiddle = "runLegacyMiddleWithOriginalPayload();";
const unrelatedReplacementMiddle = "executeDifferentMiddleReplacementPath();";

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

  it("rejects a three-line rewrite with one near-copy before the anchor", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: `${original}\n${unrelatedSourceMiddle}\n${unrelatedSource}\nanchor\n`,
        startLine: 4,
        endLine: 4,
        replacementLines: [updated, unrelatedReplacementMiddle, unrelatedReplacement],
      }),
    ).toContain("partially rewrites a source block before");
  });

  it("rejects a three-line rewrite with one near-copy after the anchor", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: `anchor\n${unrelatedSourceMiddle}\n${unrelatedSource}\n${original}\n`,
        startLine: 1,
        endLine: 1,
        replacementLines: [unrelatedReplacementMiddle, unrelatedReplacement, updated],
      }),
    ).toContain("partially rewrites a source block after");
  });

  it("accepts a three-line near-copy aligned to the wrong source line", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: `${original}\n${unrelatedSourceMiddle}\n${unrelatedSource}\nanchor\n`,
        startLine: 4,
        endLine: 4,
        replacementLines: [unrelatedReplacementMiddle, updated, unrelatedReplacement],
      }),
    ).toBeNull();
  });

  it("rejects a longer rewrite containing a changed delimiter before the anchor", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: `${original}\n}\n${unrelatedSource}\nanchor\n`,
        startLine: 4,
        endLine: 4,
        replacementLines: [updated, "]", unrelatedReplacement],
      }),
    ).toContain("partially rewrites a source block before");
  });

  it("rejects a longer rewrite containing a changed delimiter after the anchor", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: `anchor\n${unrelatedSource}\n}\n${original}\n`,
        startLine: 1,
        endLine: 1,
        replacementLines: [unrelatedReplacement, "]", updated],
      }),
    ).toContain("partially rewrites a source block after");
  });

  it("rejects a longer rewrite containing a changed blank line", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: `${original}\n\n${unrelatedSource}\nanchor\n`,
        startLine: 4,
        endLine: 4,
        replacementLines: [updated, "}", unrelatedReplacement],
      }),
    ).toContain("partially rewrites a source block before");
  });

  it("accepts a near-copy with only changed neutral neighbors", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: `${original}\n}\n\nanchor\n`,
        startLine: 4,
        endLine: 4,
        replacementLines: [updated, "]", "{"],
      }),
    ).toBeNull();
  });

  it("accepts a near-copy with a changed delimiter and short text", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: `${original}\n}\ntodo\nanchor\n`,
        startLine: 4,
        endLine: 4,
        replacementLines: [updated, "]", "done"],
      }),
    ).toBeNull();
  });
});
