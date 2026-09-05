import { describe, expect, it } from "vitest";
import { truncateBody } from "./body-truncate.mts";

describe("truncateBody", () => {
  it("returns the body unchanged when under the budget", () => {
    expect(truncateBody("short body", 1000)).toBe("short body");
  });

  it("keeps a head and tail and elides the middle for plain text", () => {
    const lines = Array.from({ length: 30 }, (_, i) => `line ${i}`);
    const out = truncateBody(lines.join("\n"), 50);
    expect(out).toBe("line 0\nline 1\nline 2\nline 3\nline 4\n\n[…24 lines elided]\n\nline 29");
  });

  it("includes a full-text link in the marker when a url is given", () => {
    const lines = Array.from({ length: 30 }, (_, i) => `line ${i}`);
    const out = truncateBody(lines.join("\n"), 50, "https://github.com/o/r/pull/1#comment");
    expect(out).toContain("[…24 lines elided — full text: https://github.com/o/r/pull/1#comment]");
  });

  it("extends the head past a fence the natural cutoff would land inside", () => {
    const lines = ["AAAAA", "```", "BBBBB", "CCCCC", "```", "D".repeat(50)];
    const out = truncateBody(lines.join("\n"), 30);
    expect(out).toBe("AAAAA\n```\nBBBBB\nCCCCC\n```\n\n[…1 lines elided]\n\n");
    expect(fenceLineCount(out)).toBe(2);
  });

  it("extends the head past a fence while a real tail still survives", () => {
    const lines = [
      "AAAAA",
      "```",
      "BBBBB",
      "CCCCC",
      "```",
      ...Array.from({ length: 10 }, (_, i) => `filler ${i}`),
      "TAIL-ONE",
      "TAIL-TWO",
    ];
    const out = truncateBody(lines.join("\n"), 60);
    expect(out).toBe(
      "AAAAA\n```\nBBBBB\nCCCCC\n```\nfiller 0\n\n[…9 lines elided]\n\nTAIL-ONE\nTAIL-TWO",
    );
    expect(fenceLineCount(out)).toBe(2);
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
    expect(out).toBe(
      "filler 0\nfiller 1\nfiller 2\n\n[…7 lines elided]\n\n```\nXXXXX\nYYYYY\n```\nZZZZZ",
    );
    expect(fenceLineCount(out)).toBe(2);
  });

  it("skips truncation when an unterminated fence spans the whole body", () => {
    const lines = ["```", ...Array.from({ length: 20 }, (_, i) => `code ${i}`)];
    const body = lines.join("\n");
    expect(truncateBody(body, 40)).toBe(body);
  });
});

function fenceLineCount(text: string): number {
  return text.split("\n").filter((l) => /^`{3,}/.test(l.trim())).length;
}
