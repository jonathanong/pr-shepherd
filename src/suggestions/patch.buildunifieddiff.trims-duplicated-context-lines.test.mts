import { describe, it, expect } from "vitest";
import { buildUnifiedDiff } from "../../test-helpers/suggestions/patch.test-support.mts";

describe("buildUnifiedDiff (context-line trimming, issue #294)", () => {
  it("issue repro: trims leading and trailing lines from an over-broad suggestion box", () => {
    // Reviewer highlighted line 4 only (isStall) but pasted 4 lines into the box,
    // including 2 lines already present before and 1 already present after the range.
    const content =
      [
        "finish({",
        "  code: a,",
        "  retryable: b,",
        "  isStall: x,", // line 4 — the highlighted / removed line
        "  hung,",
        "})",
      ].join("\n") + "\n";

    const patch = buildUnifiedDiff({
      path: "foo.ts",
      originalContent: content,
      startLine: 4,
      endLine: 4,
      replacementLines: [
        "  code: a,", // duplicates line 2 — should become context, not addition
        "  retryable: b,", // duplicates line 3 — should become context, not addition
        "  isStall: y,", // the actual change
        "  hung,", // duplicates line 5 — should become context, not addition
      ],
    });

    // Only the genuinely changed line is an addition.
    expect(patch).toContain("-  isStall: x,\n");
    expect(patch).toContain("+  isStall: y,\n");

    // Duplicated lines must NOT appear as additions.
    expect(patch).not.toContain("+  code: a,\n");
    expect(patch).not.toContain("+  retryable: b,\n");
    expect(patch).not.toContain("+  hung,\n");

    // 1 removed, 1 added → hunk counts are unchanged (6 orig, 6 new).
    expect(patch).toContain("@@ -1,6 +1,6 @@\n");
  });

  it("trims leading duplicate lines only", () => {
    const content = "a\nb\nc\nd\n";
    // Replace line 3 (c). Suggestion box prepends "b" — already present just before.
    const patch = buildUnifiedDiff({
      path: "f.ts",
      originalContent: content,
      startLine: 3,
      endLine: 3,
      replacementLines: ["b", "C"],
    });

    expect(patch).toContain("-c\n");
    expect(patch).toContain("+C\n");
    expect(patch).not.toContain("+b\n");
    // "b" still appears as a context line.
    expect(patch).toContain(" b\n");
  });

  it("trims trailing duplicate lines only", () => {
    const content = "a\nb\nc\nd\n";
    // Replace line 2 (b). Suggestion box appends "c" — already present just after.
    const patch = buildUnifiedDiff({
      path: "f.ts",
      originalContent: content,
      startLine: 2,
      endLine: 2,
      replacementLines: ["B", "c"],
    });

    expect(patch).toContain("-b\n");
    expect(patch).toContain("+B\n");
    expect(patch).not.toContain("+c\n");
    // "c" still appears as a context line.
    expect(patch).toContain(" c\n");
  });

  it("leaves replacement unchanged when no context duplication exists", () => {
    const content = "a\nb\nc\nd\n";
    const patch = buildUnifiedDiff({
      path: "f.ts",
      originalContent: content,
      startLine: 2,
      endLine: 2,
      replacementLines: ["B"],
    });

    expect(patch).toContain("-b\n");
    expect(patch).toContain("+B\n");
    expect(patch).toContain("@@ -1,4 +1,4 @@\n");
  });

  it("trims leading duplicates that extend beyond the 3-line context window", () => {
    // 8 lines before the removed range; suggestion duplicates 4 of them.
    const content = ["p", "q", "r", "s", "t", "u", "v", "w", "X", "z"].join("\n") + "\n";
    // Remove line 9 (X), replace with [t, u, v, w, Y] — 4 leading duplicates.
    const patch = buildUnifiedDiff({
      path: "f.ts",
      originalContent: content,
      startLine: 9,
      endLine: 9,
      replacementLines: ["t", "u", "v", "w", "Y"],
      context: 3,
    });

    // Only "Y" should be an addition; t/u/v/w are already in the file above the removed range.
    expect(patch).toContain("-X\n");
    expect(patch).toContain("+Y\n");
    expect(patch).not.toContain("+t\n");
    expect(patch).not.toContain("+u\n");
    expect(patch).not.toContain("+v\n");
    expect(patch).not.toContain("+w\n");
  });
});
