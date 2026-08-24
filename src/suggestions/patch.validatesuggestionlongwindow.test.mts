import { describe, expect, it } from "vitest";
import { getUnsafeSuggestionRangeReason } from "../../test-helpers/suggestions/patch.test-support.mts";

const original = "const firstValue = computeOriginalVeryLongThing();";
const updated = "const firstValue = computeUpdatedVeryLongThing();";

const sourceLines = (length: number): string[] =>
  Array.from({ length }, (_, index) => `runLegacySource${index}WithOriginalPayload();`);
const replacementLines = (length: number): string[] =>
  Array.from({ length }, (_, index) => `executeDifferentTarget${index}UsingNewResult();`);

describe("getUnsafeSuggestionRangeReason — long adjacent rewrite windows", () => {
  it("checks an eight-line rewrite", () => {
    const source = [original, ...sourceLines(7)];
    const replacement = [updated, ...replacementLines(7)];
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: `${source.join("\n")}\nanchor\n`,
        startLine: 9,
        endLine: 9,
        replacementLines: replacement,
      }),
    ).toContain("partially rewrites a source block before");
  });

  it("checks a nine-line rewrite before the anchor", () => {
    const source = [original, ...sourceLines(8)];
    const replacement = [updated, ...replacementLines(8)];
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: `${source.join("\n")}\nanchor\n`,
        startLine: 10,
        endLine: 10,
        replacementLines: replacement,
      }),
    ).toContain("partially rewrites a source block before");
  });

  it("checks a nine-line rewrite after the anchor", () => {
    const source = [...sourceLines(8), original];
    const replacement = [...replacementLines(8), updated];
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: `anchor\n${source.join("\n")}\n`,
        startLine: 1,
        endLine: 1,
        replacementLines: replacement,
      }),
    ).toContain("partially rewrites a source block after");
  });

  it("checks a retained-anchor nine-line rewrite before the anchor", () => {
    const source = [original, ...sourceLines(8)];
    const replacement = [updated, ...replacementLines(8), "anchor"];
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: `${source.join("\n")}\nanchor\n`,
        startLine: 10,
        endLine: 10,
        replacementLines: replacement,
      }),
    ).toContain("retains the complete anchored range");
  });

  it("checks a retained-anchor nine-line rewrite after the anchor", () => {
    const source = [...sourceLines(8), original];
    const replacement = ["anchor", ...replacementLines(8), updated];
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: `anchor\n${source.join("\n")}\n`,
        startLine: 1,
        endLine: 1,
        replacementLines: replacement,
      }),
    ).toContain("retains the complete anchored range");
  });

  it("accepts a nine-line all-unrelated insertion", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: `${sourceLines(9).join("\n")}\nanchor\n`,
        startLine: 10,
        endLine: 10,
        replacementLines: replacementLines(9),
      }),
    ).toBeNull();
  });

  it("accepts work at the similarity scan budget", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: `${sourceLines(100).join("\n")}\nanchor\n`,
        startLine: 101,
        endLine: 101,
        replacementLines: replacementLines(100),
      }),
    ).toBeNull();
  });

  it("fails closed above the similarity scan budget", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: `${sourceLines(101).join("\n")}\nanchor\n`,
        startLine: 102,
        endLine: 102,
        replacementLines: replacementLines(101),
      }),
    ).toContain("require too much similarity work");
  });

  it("aggregates work across direct scans in both directions", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: `${sourceLines(1).join("\n")}\nanchor\n${sourceLines(100).join("\n")}\n`,
        startLine: 2,
        endLine: 2,
        replacementLines: replacementLines(100),
      }),
    ).toContain("require too much similarity work");
  });

  it("aggregates work across repeated retained anchors", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: `${sourceLines(100).join("\n")}\nanchor\n${sourceLines(100).join("\n")}\n`,
        startLine: 101,
        endLine: 101,
        replacementLines: Array.from({ length: 63 }, () => "anchor"),
      }),
    ).toContain("require too much similarity work");
  });

  it("accepts a large retained-anchor extension after EOF", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: `${sourceLines(100).join("\n")}\nanchor\n`,
        startLine: 101,
        endLine: 101,
        replacementLines: ["anchor", ...replacementLines(100)],
      }),
    ).toBeNull();
  });

  it("accepts a large retained-anchor extension before BOF", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: `anchor\n${sourceLines(100).join("\n")}\n`,
        startLine: 1,
        endLine: 1,
        replacementLines: [...replacementLines(100), "anchor"],
      }),
    ).toBeNull();
  });

  it("rejects an after-source rewrite moved before a retained anchor", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: `anchor\n${original}\n`,
        startLine: 1,
        endLine: 1,
        replacementLines: [updated, "anchor"],
      }),
    ).toContain("appears to rewrite source immediately after");
  });

  it("rejects a before-source rewrite moved after a retained anchor", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: `${original}\nanchor\n`,
        startLine: 2,
        endLine: 2,
        replacementLines: ["anchor", updated],
      }),
    ).toContain("appears to rewrite source immediately before");
  });
});
