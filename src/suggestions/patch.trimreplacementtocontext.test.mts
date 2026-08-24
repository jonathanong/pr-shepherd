/**
 * Unit-style tests for the context-trimming logic inside buildUnifiedDiff.
 * Each test uses the minimal file content needed to isolate one trimming behaviour,
 * and inspects the diff output rather than the internal function directly.
 */
import { describe, it, expect } from "vitest";
import { buildUnifiedDiff } from "../../test-helpers/suggestions/patch.test-support.mts";

// Helper: build a diff and return only the +/- lines for easy assertion.
function changedLines(patch: string): string[] {
  return patch
    .split("\n")
    .filter((l) => l.startsWith("+") || l.startsWith("-"))
    .filter((l) => !l.startsWith("---") && !l.startsWith("+++"));
}

describe("trimReplacementToContext (via buildUnifiedDiff)", () => {
  it("returns replacementLines unchanged when nothing duplicates adjacent context", () => {
    const content = "a\nb\nc\nd\n";
    const lines = changedLines(
      buildUnifiedDiff({
        path: "f.ts",
        originalContent: content,
        startLine: 2,
        endLine: 2,
        replacementLines: ["B"],
      }),
    );
    expect(lines).toEqual(["-b", "+B"]);
  });

  it("trims one leading duplicate", () => {
    // Remove line 3 (c); suggestion prepends "b" which is line 2.
    const content = "a\nb\nc\nd\n";
    const lines = changedLines(
      buildUnifiedDiff({
        path: "f.ts",
        originalContent: content,
        startLine: 3,
        endLine: 3,
        replacementLines: ["b", "C"],
      }),
    );
    expect(lines).toEqual(["-c", "+C"]);
  });

  it("trims one trailing duplicate", () => {
    // Remove line 2 (b); suggestion appends "c" which is line 3.
    const content = "a\nb\nc\nd\n";
    const lines = changedLines(
      buildUnifiedDiff({
        path: "f.ts",
        originalContent: content,
        startLine: 2,
        endLine: 2,
        replacementLines: ["B", "c"],
      }),
    );
    expect(lines).toEqual(["-b", "+B"]);
  });

  it("trims both leading and trailing duplicates, leaving the changed line", () => {
    // Remove line 2 (b); "a" before and "c" after are already in the file.
    const content = "a\nb\nc\nd\n";
    const lines = changedLines(
      buildUnifiedDiff({
        path: "f.ts",
        originalContent: content,
        startLine: 2,
        endLine: 2,
        replacementLines: ["a", "NEW", "c"],
      }),
    );
    expect(lines).toEqual(["-b", "+NEW"]);
  });

  it("returns empty additions when entire replacement is duplicated adjacent context (pure deletion)", () => {
    // Remove line 2 (b); replacement ["a","c"] is entirely existing context — net effect is deletion.
    const content = "a\nb\nc\n";
    const lines = changedLines(
      buildUnifiedDiff({
        path: "f.ts",
        originalContent: content,
        startLine: 2,
        endLine: 2,
        replacementLines: ["a", "c"],
      }),
    );
    expect(lines).toEqual(["-b"]);
  });

  it("handles empty replacementLines (explicit deletion)", () => {
    const content = "a\nb\nc\n";
    const lines = changedLines(
      buildUnifiedDiff({
        path: "f.ts",
        originalContent: content,
        startLine: 2,
        endLine: 2,
        replacementLines: [],
      }),
    );
    expect(lines).toEqual(["-b"]);
  });

  it("normalises trailing \\r from CRLF file lines when comparing", () => {
    // CRLF file: split("\n") leaves \r on each entry.
    const content = "a\r\nb\r\nc\r\nd\r\n";
    // Remove line 3; prepend "b" (no \r) which should match fileLines[1]="b\r".
    const lines = changedLines(
      buildUnifiedDiff({
        path: "f.ts",
        originalContent: content,
        startLine: 3,
        endLine: 3,
        replacementLines: ["b", "C"],
      }),
    );
    expect(lines).toEqual(["-c\r", "+C\r"]);
  });

  it("normalises \\r on both sides: replacement lines that carry \\r still match CRLF file lines", () => {
    // Both the file lines and the replacement lines carry \r.
    // norm() must be applied to both sides so the trim still fires.
    const content = "a\r\nb\r\nc\r\nd\r\n";
    const lines = changedLines(
      buildUnifiedDiff({
        path: "f.ts",
        originalContent: content,
        startLine: 3,
        endLine: 3,
        replacementLines: ["b\r", "C"],
      }),
    );
    // "b\r" duplicates fileLines[1]="b\r" — should be trimmed, not added.
    expect(lines).toEqual(["-c\r", "+C\r"]);
  });

  it("trims leading duplicates longer than the 3-line context window", () => {
    // 8 lines before the removed range; 4 are duplicated in the replacement.
    const content = ["p", "q", "r", "s", "t", "u", "v", "w", "X", "z"].join("\n") + "\n";
    const lines = changedLines(
      buildUnifiedDiff({
        path: "f.ts",
        originalContent: content,
        startLine: 9,
        endLine: 9,
        replacementLines: ["t", "u", "v", "w", "Y"],
        context: 3,
      }),
    );
    expect(lines).toEqual(["-X", "+Y"]);
  });
});
