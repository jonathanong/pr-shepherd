import { describe, expect, it } from "vitest";
import { truncateBody } from "./body-truncate.mts";

describe("truncateBody", () => {
  it("returns the body unchanged when under the budget", () => {
    expect(truncateBody("short body", 1000)).toBe("short body");
  });

  it("keeps a head and tail and elides the middle for plain text", () => {
    const lines = Array.from({ length: 30 }, (_, i) => `line ${i}`);
    const out = truncateBody(lines.join("\n"), 50);
    expect(out).toBe("line 0\nline 1\nline 2\nline 3\nline 4\n\n[…188 chars elided]\n\nline 29");
  });

  it("falls back to a bare url in the marker when it doesn't match a known comment shape", () => {
    const lines = Array.from({ length: 30 }, (_, i) => `line ${i}`);
    const out = truncateBody(lines.join("\n"), 50, "https://github.com/o/r/pull/1#comment");
    expect(out).toContain("full text: https://github.com/o/r/pull/1#comment]");
  });

  it("points at a gh api command for a review (inline) comment url", () => {
    const lines = Array.from({ length: 30 }, (_, i) => `line ${i}`);
    const out = truncateBody(
      lines.join("\n"),
      50,
      "https://github.com/owner/repo/pull/42#discussion_r123456789",
    );
    expect(out).toContain("full text: gh api repos/owner/repo/pulls/comments/123456789]");
  });

  it("points at a gh api command for a PR-level (issue) comment url", () => {
    const lines = Array.from({ length: 30 }, (_, i) => `line ${i}`);
    const out = truncateBody(
      lines.join("\n"),
      50,
      "https://github.com/owner/repo/pull/42#issuecomment-987654321",
    );
    expect(out).toContain("full text: gh api repos/owner/repo/issues/comments/987654321]");
  });

  it("falls back to a character-level slice when a single line exceeds the whole budget", () => {
    const body = "X".repeat(2000);
    const out = truncateBody(body, 50);
    expect(out).toBe(`${"X".repeat(35)}\n\n[…1950 chars elided]\n\n${"X".repeat(15)}`);
  });

  it("falls back to a character-level tail slice when only the trailing line is oversized", () => {
    const out = truncateBody(`short\n${"Y".repeat(2000)}`, 50);
    expect(out).toBe(`short\n\n[…1986 chars elided]\n\n${"Y".repeat(15)}`);
  });

  it("falls back to a character-level head slice when only the leading line is oversized", () => {
    const out = truncateBody(`${"Z".repeat(2000)}\nshort tail`, 50);
    expect(out).toBe(`${"Z".repeat(35)}\n\n[…1966 chars elided]\n\nshort tail`);
  });

  it("extends the head past a fence the natural cutoff would land inside", () => {
    const lines = ["AAAAA", "```", "BBBBB", "CCCCC", "```", "D".repeat(50)];
    const out = truncateBody(lines.join("\n"), 30);
    expect(out).toBe("AAAAA\n```\nBBBBB\nCCCCC\n```\n\n[…42 chars elided]\n\nDDDDDDDDD");
    expect(fenceLineCount(out, "`")).toBe(2);
  });

  it("extends the tail past a fence the natural cutoff would land inside", () => {
    const lines = [
      ...Array.from({ length: 10 }, (_, i) => `filler ${i}`),
      "```",
      "XXXXX",
      "YYYYY",
      "```",
      "ZZZZZ",
    ];
    const out = truncateBody(lines.join("\n"), 40);
    expect(out).toContain("```\nXXXXX\nYYYYY\n```\nZZZZZ");
    expect(fenceLineCount(out, "`")).toBe(2);
  });

  it("extends the head past a tilde fence the natural cutoff would land inside", () => {
    const lines = [
      "AAAAA",
      "~~~",
      "BBBBB",
      "CCCCC",
      "~~~",
      ...Array.from({ length: 10 }, (_, i) => `filler ${i}`),
      "TAIL-ONE",
      "TAIL-TWO",
    ];
    const out = truncateBody(lines.join("\n"), 60);
    expect(out).toBe(
      "AAAAA\n~~~\nBBBBB\nCCCCC\n~~~\nfiller 0\n\n[…82 chars elided]\n\nTAIL-ONE\nTAIL-TWO",
    );
    expect(fenceLineCount(out, "~")).toBe(2);
  });

  it("does not let a tilde run close a backtick fence, or vice versa", () => {
    const lines = ["```", "code", "~~~", "not a closer for backticks", "```"];
    const body = lines.join("\n");
    expect(truncateBody(body, 5)).toBe(body);
  });

  it("skips truncation when an unterminated fence spans the whole body", () => {
    const lines = ["```", ...Array.from({ length: 20 }, (_, i) => `code ${i}`)];
    const body = lines.join("\n");
    expect(truncateBody(body, 40)).toBe(body);
  });
});

function fenceLineCount(text: string, char: "`" | "~"): number {
  const re = char === "`" ? /^`{3,}/ : /^~{3,}/;
  return text.split("\n").filter((l) => re.test(l.trim())).length;
}
