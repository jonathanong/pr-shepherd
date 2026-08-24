import { describe, expect, it } from "vitest";
import { getUnsafeSuggestionRangeReason } from "../../test-helpers/suggestions/patch.test-support.mts";

const shapes = [
  {
    name: "splits one source line into two replacement lines",
    source: ["const value = computeOriginalThing();"],
    replacement: ["const value =", "  computeUpdatedThing();"],
  },
  {
    name: "joins two source lines into one replacement line",
    source: ["const value =", "  computeOriginalThing();"],
    replacement: ["const value = computeUpdatedThing();"],
  },
] as const;

const cases = shapes.flatMap(({ name, source, replacement }) => [
  {
    name: `${name} before the anchor`,
    input: {
      originalContent: `${[...source, "anchor"].join("\n")}\n`,
      startLine: source.length + 1,
      endLine: source.length + 1,
      replacementLines: [...replacement],
    },
    reason: "partially rewrites a source block before",
  },
  {
    name: `${name} after the anchor`,
    input: {
      originalContent: `${["anchor", ...source].join("\n")}\n`,
      startLine: 1,
      endLine: 1,
      replacementLines: [...replacement],
    },
    reason: "partially rewrites a source block after",
  },
  {
    name: `${name} after a retained anchor`,
    input: {
      originalContent: `${["anchor", ...source].join("\n")}\n`,
      startLine: 1,
      endLine: 1,
      replacementLines: ["anchor", ...replacement],
    },
    reason: "appears to rewrite source immediately after",
  },
  {
    name: `${name} before a retained anchor`,
    input: {
      originalContent: `${[...source, "anchor"].join("\n")}\n`,
      startLine: source.length + 1,
      endLine: source.length + 1,
      replacementLines: [...replacement, "anchor"],
    },
    reason: "appears to rewrite source immediately before",
  },
]);

describe("getUnsafeSuggestionRangeReason — changed line counts", () => {
  it.each(cases)("rejects a rewrite that $name", ({ input, reason }) => {
    expect(getUnsafeSuggestionRangeReason(input)).toContain(reason);
  });

  it("rejects a whitespace-only line split next to the anchor", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: "const value = computeThing();\nanchor\n",
        startLine: 2,
        endLine: 2,
        replacementLines: ["const value =", "  computeThing();"],
      }),
    ).toContain("partially rewrites a source block before");
  });
});
