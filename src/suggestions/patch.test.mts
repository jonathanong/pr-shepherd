import { describe, it, expect } from "vitest";

import { buildUnifiedDiff } from "./patch.mts";

describe("buildUnifiedDiff", () => {
  it("replaces a single line in the middle of a file", () => {
    const content = "a\nb\nc\nd\ne\n";
    const patch = buildUnifiedDiff({
      path: "src/foo.ts",
      originalContent: content,
      startLine: 3,
      endLine: 3,
      replacementLines: ["C"],
    });
    expect(patch).toContain("--- a/src/foo.ts\n");
    expect(patch).toContain("+++ b/src/foo.ts\n");
    expect(patch).toContain("@@ -1,5 +1,5 @@\n");
    expect(patch).toContain(" a\n");
    expect(patch).toContain(" b\n");
    expect(patch).toContain("-c\n");
    expect(patch).toContain("+C\n");
    expect(patch).toContain(" d\n");
    expect(patch).toContain(" e\n");
    expect(patch).not.toContain("No newline");
  });

  it("deletes a line (empty replacement)", () => {
    const content = "a\nb\nc\n";
    const patch = buildUnifiedDiff({
      path: "f.ts",
      originalContent: content,
      startLine: 2,
      endLine: 2,
      replacementLines: [],
    });
    expect(patch).toContain("@@ -1,3 +1,2 @@\n");
    expect(patch).toContain("-b\n");
    expect(patch).not.toContain("+b");
  });

  it("replaces a multi-line range with more lines", () => {
    const content = "a\nb\nc\nd\ne\n";
    const patch = buildUnifiedDiff({
      path: "f.ts",
      originalContent: content,
      startLine: 2,
      endLine: 3,
      replacementLines: ["x", "y", "z"],
    });
    expect(patch).toContain("@@ -1,5 +1,6 @@\n");
    expect(patch).toContain("-b\n");
    expect(patch).toContain("-c\n");
    expect(patch).toContain("+x\n");
    expect(patch).toContain("+y\n");
    expect(patch).toContain("+z\n");
  });

  it("clips before-context to start of file", () => {
    const content = "a\nb\nc\n";
    const patch = buildUnifiedDiff({
      path: "f.ts",
      originalContent: content,
      startLine: 1,
      endLine: 1,
      replacementLines: ["A"],
    });
    // hunk starts at line 1 with no before-context
    expect(patch).toMatch(/@@ -1,\d+ \+1,\d+ @@/);
    expect(patch).toContain("-a\n");
    expect(patch).toContain("+A\n");
  });

  it("clips after-context to end of file", () => {
    const content = "a\nb\nc\n";
    const patch = buildUnifiedDiff({
      path: "f.ts",
      originalContent: content,
      startLine: 3,
      endLine: 3,
      replacementLines: ["C"],
    });
    expect(patch).toContain("-c\n");
    expect(patch).toContain("+C\n");
    expect(patch).not.toContain("No newline");
  });

  it("adds no-newline marker when file has no trailing newline and hunk covers last line", () => {
    const content = "a\nb"; // no trailing newline
    const patch = buildUnifiedDiff({
      path: "f.ts",
      originalContent: content,
      startLine: 2,
      endLine: 2,
      replacementLines: ["B"],
    });
    expect(patch).toContain("-b\n");
    expect(patch).toContain("\\ No newline at end of file\n");
  });

  it("no-newline marker not emitted when hunk does not cover last line", () => {
    const content = "a\nb\nc"; // no trailing newline but hunk is in middle
    const patch = buildUnifiedDiff({
      path: "f.ts",
      originalContent: content,
      startLine: 1,
      endLine: 1,
      replacementLines: ["A"],
      context: 0,
    });
    // The removed line a is NOT the last line (c is), so no marker needed for -a
    expect(patch).toContain("-a\n");
    expect(patch).not.toContain("No newline");
  });

  it("appends \\r to replacement lines when original uses CRLF", () => {
    const content = "a\r\nb\r\nc\r\n";
    const patch = buildUnifiedDiff({
      path: "f.ts",
      originalContent: content,
      startLine: 2,
      endLine: 2,
      replacementLines: ["B"],
    });
    // replacement line should have \r before \n to match CRLF style
    expect(patch).toContain("+B\r\n");
    // context lines already carry \r from split("\n")
    expect(patch).toContain(" a\r\n");
  });

  it("handles empty file (zero-line body)", () => {
    const content = "";
    const patch = buildUnifiedDiff({
      path: "f.ts",
      originalContent: content,
      startLine: 1,
      endLine: 1,
      replacementLines: ["inserted"],
    });
    expect(patch).toContain("+inserted\n");
    expect(patch).toContain("@@ -1,0 +1,1 @@\n");
  });

  it("emits no-newline marker for context lines before the hunk when last line is in before-context", () => {
    // File has no trailing newline; the last line appears in the before-context window
    const content = "a\nb"; // 2 lines, no trailing newline — line 2 = last
    const patch = buildUnifiedDiff({
      path: "f.ts",
      originalContent: content,
      startLine: 2,
      endLine: 2,
      replacementLines: ["B"],
      context: 0,
    });
    // With context=0, before-context is empty — no no-newline in before section.
    // The removed line IS the last line so it gets the marker.
    expect(patch).toContain("-b\n");
    expect(patch).toContain("\\ No newline at end of file\n");
  });

  it("emits no-newline marker for after-context lines when last line is in after-context", () => {
    // File has no trailing newline; last line falls in the after-context of the hunk
    const content = "a\nb\nc"; // 3 lines, no trailing newline
    const patch = buildUnifiedDiff({
      path: "f.ts",
      originalContent: content,
      startLine: 1,
      endLine: 1,
      replacementLines: ["A"],
      context: 3,
    });
    // after-context includes line 2 (b) and line 3 (c = last, no newline)
    expect(patch).toContain(" c\n");
    expect(patch).toContain("\\ No newline at end of file\n");
  });

  it("honours custom context size", () => {
    const content = "1\n2\n3\n4\n5\n6\n7\n8\n9\n";
    const patch = buildUnifiedDiff({
      path: "f.ts",
      originalContent: content,
      startLine: 5,
      endLine: 5,
      replacementLines: ["five"],
      context: 1,
    });
    // Only 1 line of context each side
    expect(patch).toContain(" 4\n");
    expect(patch).toContain(" 6\n");
    expect(patch).not.toContain(" 3\n");
    expect(patch).not.toContain(" 7\n");
  });
});
