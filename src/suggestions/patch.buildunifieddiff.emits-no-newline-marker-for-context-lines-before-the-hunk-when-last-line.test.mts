// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerHooks, buildUnifiedDiff } from "./patch.test-support.mts";

describe("buildUnifiedDiff", () => {
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
  it("emits no-newline marker when the last line appears in before-context", () => {
    const content = "a\nb";
    const patch = buildUnifiedDiff({
      path: "f.ts",
      originalContent: content,
      startLine: 3,
      endLine: 2,
      replacementLines: ["c"],
      context: 1,
    });
    expect(patch).toContain(" b\n");
    expect(patch).toContain("\\ No newline at end of file\n");
    expect(patch).toContain("+c\n");
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
