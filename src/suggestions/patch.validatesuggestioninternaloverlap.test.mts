import { describe, expect, it } from "vitest";
import { getUnsafeSuggestionRangeReason } from "../../test-helpers/suggestions/patch.test-support.mts";

const internalSource = [
  "const start = oldStart();",
  "const middle = preserveThisValue();",
  "return middle;",
  "const finish = oldFinish();",
];
const internalReplacement = [
  "const start = newStart();",
  "const middle = preserveThisValue();",
  "return middle;",
  "const finish = newFinish();",
];

describe("getUnsafeSuggestionRangeReason — internal overlap", () => {
  it.each([
    {
      name: "before the anchor",
      originalContent: `${[...internalSource, "anchor"].join("\n")}\n`,
      startLine: 5,
      replacementLines: internalReplacement,
      reason: "partially rewrites a source block before",
    },
    {
      name: "after the anchor",
      originalContent: `${["anchor", ...internalSource].join("\n")}\n`,
      startLine: 1,
      replacementLines: internalReplacement,
      reason: "partially rewrites a source block after",
    },
    {
      name: "after a retained anchor",
      originalContent: `${["anchor", ...internalSource].join("\n")}\n`,
      startLine: 1,
      replacementLines: ["anchor", ...internalReplacement],
      reason: "appears to rewrite source immediately after",
    },
    {
      name: "before a retained anchor",
      originalContent: `${[...internalSource, "anchor"].join("\n")}\n`,
      startLine: 5,
      replacementLines: [...internalReplacement, "anchor"],
      reason: "appears to rewrite source immediately before",
    },
  ])("rejects copied internal lines $name", ({ reason, ...input }) => {
    expect(getUnsafeSuggestionRangeReason({ ...input, endLine: input.startLine })).toContain(
      reason,
    );
  });

  it("detects copied internal lines after a shifted replacement line", () => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: `${[...internalSource, "anchor"].join("\n")}\n`,
        startLine: 5,
        endLine: 5,
        replacementLines: [
          internalReplacement[0],
          "const added = prepare();",
          ...internalReplacement.slice(1),
        ],
      }),
    ).toContain("partially rewrites a source block before");
  });

  it.each([
    { name: "a blank line", neutralLine: "" },
    { name: "a delimiter", neutralLine: "}" },
  ])("allows $name between substantive copied internal lines", ({ neutralLine }) => {
    const source = [
      "const start = oldStart();",
      "const sharedValue = preserveThisValue();",
      neutralLine,
      "return preserveThisOtherValue();",
      "const finish = oldFinish();",
    ];
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: `${[...source, "anchor"].join("\n")}\n`,
        startLine: 6,
        endLine: 6,
        replacementLines: [
          "const start = newStart();",
          ...source.slice(1, -1),
          "const finish = newFinish();",
        ],
      }),
    ).toContain("partially rewrites a source block before");
  });

  it.each([
    {
      name: "only one substantive internal line matches",
      source: [
        "alphaOriginalBoundary();",
        "const sharedValue = preserve();",
        "omegaOriginalEnding();",
      ],
      replacement: [
        "zetaReplacementOpening();",
        "const sharedValue = preserve();",
        "deltaReplacementClosing();",
      ],
    },
    {
      name: "the internal run has only one substantive line",
      source: ["old boundary", "}", "const sharedValue = preserve();", "old ending"],
      replacement: ["new boundary", "}", "const sharedValue = preserve();", "new ending"],
    },
    {
      name: "the internal run contains only delimiters",
      source: ["old boundary", "{", "}", "];", "old ending"],
      replacement: ["new boundary", "{", "}", "];", "new ending"],
    },
  ])("accepts an ordinary replacement when $name", ({ source, replacement }) => {
    expect(
      getUnsafeSuggestionRangeReason({
        originalContent: `${[...source, "anchor"].join("\n")}\n`,
        startLine: source.length + 1,
        endLine: source.length + 1,
        replacementLines: replacement,
      }),
    ).toBeNull();
  });
});
