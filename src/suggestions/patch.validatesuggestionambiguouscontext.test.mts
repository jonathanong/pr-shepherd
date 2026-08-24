import { describe, expect, it } from "vitest";
import { getUnsafeSuggestionRangeReason } from "../../test-helpers/suggestions/patch.test-support.mts";

describe("getUnsafeSuggestionRangeReason — ambiguous context trim", () => {
  it.each([
    {
      name: "preceding context duplicates the anchor",
      originalContent: "same\nsame\nnext\n",
      startLine: 2,
      replacementLines: ["same", "same"],
    },
    {
      name: "following context duplicates the anchor",
      originalContent: "previous\nsame\nsame\n",
      startLine: 2,
      replacementLines: ["same", "same"],
    },
    {
      name: "copied leading context precedes another insertion",
      originalContent: "same\nsame\nnext\n",
      startLine: 2,
      replacementLines: ["same", "same", "inserted"],
    },
    {
      name: "copied trailing context follows another insertion",
      originalContent: "previous\nsame\nsame\n",
      startLine: 2,
      replacementLines: ["inserted", "same", "same"],
    },
  ])("refuses when $name", ({ name: _name, ...input }) => {
    expect(getUnsafeSuggestionRangeReason({ ...input, endLine: input.startLine })).toContain(
      "intended duplicate insertion is ambiguous",
    );
  });

  it("refuses a repeated multi-line anchor", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: "A\nB\nA\nB\ntail\n",
        startLine: 3,
        endLine: 4,
        replacementLines: ["A", "B", "A", "B"],
      }),
    ).toContain("intended duplicate insertion is ambiguous");
  });

  it.each([
    {
      name: "the first anchor line duplicated before a multi-line anchor",
      originalContent: "A\nA\nB\ntail\n",
      startLine: 2,
      endLine: 3,
      replacementLines: ["A", "A", "B"],
    },
    {
      name: "the last anchor line duplicated after a multi-line anchor",
      originalContent: "head\nA\nB\nB\n",
      startLine: 2,
      endLine: 3,
      replacementLines: ["A", "B", "B"],
    },
    {
      name: "a multi-line anchor prefix duplicated before the anchor",
      originalContent: "A\nB\nA\nB\nC\ntail\n",
      startLine: 3,
      endLine: 5,
      replacementLines: ["A", "B", "A", "B", "C"],
    },
    {
      name: "a multi-line anchor suffix duplicated after the anchor",
      originalContent: "head\nA\nB\nC\nB\nC\n",
      startLine: 2,
      endLine: 4,
      replacementLines: ["A", "B", "C", "B", "C"],
    },
    {
      name: "an internal anchor line duplicated before the anchor",
      originalContent: "B\nA\nB\nC\ntail\n",
      startLine: 2,
      endLine: 4,
      replacementLines: ["B", "A", "B", "C"],
    },
    {
      name: "an internal anchor line duplicated after the anchor",
      originalContent: "head\nA\nB\nC\nB\n",
      startLine: 2,
      endLine: 4,
      replacementLines: ["A", "B", "C", "B"],
    },
  ])("refuses $name", ({ name: _name, ...input }) => {
    expect(getUnsafeSuggestionRangeReason(input)).toContain("partial copy of the anchored range");
  });

  it("normalizes CRLF while detecting a discarded partial anchor copy", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: "A\r\nA\r\nB\r\ntail\r\n",
        startLine: 2,
        endLine: 3,
        replacementLines: ["A", "A", "B"],
      }),
    ).toContain("partial copy of the anchored range");
  });

  it("normalizes CRLF while detecting a discarded anchor copy", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: "same\r\nsame\r\nnext\r\n",
        startLine: 2,
        endLine: 2,
        replacementLines: ["same", "same"],
      }),
    ).toContain("intended duplicate insertion is ambiguous");
  });

  it.each([
    {
      name: "valid insertion after an anchor that duplicates preceding context",
      originalContent: "same\nsame\nnext\n",
      startLine: 2,
      replacementLines: ["same", "inserted"],
    },
    {
      name: "valid insertion before an anchor that duplicates following context",
      originalContent: "previous\nsame\nsame\n",
      startLine: 2,
      replacementLines: ["inserted", "same"],
    },
    {
      name: "ordinary exact context",
      originalContent: "before\nanchor\nafter\n",
      startLine: 2,
      replacementLines: ["before", "anchor", "after"],
    },
    {
      name: "an explicit duplicate that survives unrelated context trimming",
      originalContent: "context\nanchor\nnext\n",
      startLine: 2,
      replacementLines: ["context", "anchor", "anchor"],
    },
  ])("accepts $name", ({ name: _name, ...input }) => {
    expect(getUnsafeSuggestionRangeReason({ ...input, endLine: input.startLine })).toBeNull();
  });

  it("accepts unrelated exact context around a multi-line anchor", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: "before\nA\nB\nafter\n",
        startLine: 2,
        endLine: 3,
        replacementLines: ["before", "A", "B", "after"],
      }),
    ).toBeNull();
  });
});
