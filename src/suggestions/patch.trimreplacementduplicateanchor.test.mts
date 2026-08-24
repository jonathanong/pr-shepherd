import { describe, expect, it } from "vitest";
import { buildUnifiedDiff } from "../../test-helpers/suggestions/patch.test-support.mts";

function changedLines(patch: string): string[] {
  return patch
    .split("\n")
    .filter((line) => line.startsWith("+") || line.startsWith("-"))
    .filter((line) => !line.startsWith("---") && !line.startsWith("+++"));
}

describe("trimReplacementToContext — duplicate anchors", () => {
  it.each([
    {
      name: "preceding context duplicates a leading retained anchor",
      content: "same\nsame\nnext\n",
      startLine: 2,
      replacementLines: ["same", "inserted"],
      expected: ["-same", "+same", "+inserted"],
    },
    {
      name: "following context duplicates a trailing retained anchor",
      content: "previous\nsame\nsame\n",
      startLine: 2,
      replacementLines: ["inserted", "same"],
      expected: ["-same", "+inserted", "+same"],
    },
    {
      name: "copied leading context and a retained anchor have the same text",
      content: "same\nsame\nnext\n",
      startLine: 2,
      replacementLines: ["same", "same", "inserted"],
      expected: ["-same", "+same", "+inserted"],
    },
    {
      name: "a retained anchor and copied trailing context have the same text",
      content: "previous\nsame\nsame\n",
      startLine: 2,
      replacementLines: ["inserted", "same", "same"],
      expected: ["-same", "+inserted", "+same"],
    },
  ])("preserves the anchor when $name", ({ content, startLine, replacementLines, expected }) => {
    expect(
      changedLines(
        buildUnifiedDiff({
          path: "f.ts",
          originalContent: content,
          startLine,
          endLine: startLine,
          replacementLines,
        }),
      ),
    ).toEqual(expected);
  });

  it("requires a complete multi-line anchor to remain after trimming duplicate context", () => {
    expect(
      changedLines(
        buildUnifiedDiff({
          path: "f.ts",
          originalContent: "A\nB\nA\nB\ntail\n",
          startLine: 3,
          endLine: 4,
          replacementLines: ["A", "B", "A", "B", "inserted", "tail"],
        }),
      ),
    ).toEqual(["-A", "-B", "+A", "+B", "+inserted"]);
  });
});
