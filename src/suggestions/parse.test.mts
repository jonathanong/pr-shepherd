import { describe, it, expect } from "vitest";
import { parseSuggestion, applySuggestionToFile, isCommittableSuggestion } from "./parse.mts";

describe("parseSuggestion", () => {
  it("extracts a single-line suggestion", () => {
    const body = ["Consider using const here.", "", "```suggestion", "const x = 10;", "```"].join(
      "\n",
    );
    expect(parseSuggestion(body)).toEqual({ lines: ["const x = 10;"] });
  });

  it("extracts a multi-line suggestion", () => {
    const body = ["```suggestion", "if (a) {", "  return b;", "}", "```"].join("\n");
    expect(parseSuggestion(body)).toEqual({
      lines: ["if (a) {", "  return b;", "}"],
    });
  });

  it("returns lines: [] for an empty (deletion) suggestion block", () => {
    const body = ["```suggestion", "```"].join("\n");
    expect(parseSuggestion(body)).toEqual({ lines: [] });
  });

  it('returns lines: [""] for a blank-line replacement', () => {
    const body = ["```suggestion", "", "```"].join("\n");
    expect(parseSuggestion(body)).toEqual({ lines: [""] });
  });

  it("returns null when no suggestion block exists", () => {
    expect(parseSuggestion("Just a regular comment.")).toBeNull();
    expect(parseSuggestion("```js\nconst x = 1;\n```")).toBeNull();
  });

  it("takes only the first block when multiple are present", () => {
    const body = ["```suggestion", "first", "```", "", "```suggestion", "second", "```"].join("\n");
    expect(parseSuggestion(body)).toEqual({ lines: ["first"] });
  });

  it("tolerates trailing whitespace/comment on the fence opener", () => {
    const body = ["```suggestion  ", "const x = 10;", "```"].join("\n");
    expect(parseSuggestion(body)).toEqual({ lines: ["const x = 10;"] });
  });

  it("strips the exact captured prefix from a nested-quote reply", () => {
    const body = ["> Original comment:", ">", "> ```suggestion", "> const x = 10;", "> ```"].join(
      "\n",
    );
    expect(parseSuggestion(body)).toEqual({ lines: ["const x = 10;"] });
  });

  it("preserves a body line that does not begin with the captured prefix", () => {
    // Body legitimately contains a markdown blockquote — it should survive.
    const body = ["```suggestion", "const quoted = '> hello';", "```"].join("\n");
    expect(parseSuggestion(body)).toEqual({ lines: ["const quoted = '> hello';"] });
  });

  it("preserves a trailing blank line inside the suggestion body", () => {
    const body = ["```suggestion", "X", "", "```"].join("\n");
    expect(parseSuggestion(body)).toEqual({ lines: ["X", ""] });
  });

  it("does not match a plain js code block", () => {
    const body = "```js\nconst x = 1;\n```";
    expect(parseSuggestion(body)).toBeNull();
  });

  it("tolerates a body without a trailing newline before the closing fence", () => {
    // Inline close: the parser's fallback path for bodies like "```suggestion\nfoo```".
    const body = "```suggestion\nfoo```";
    expect(parseSuggestion(body)).toEqual({ lines: ["foo"] });
  });

  it("preserves a nested ```suggestion substring in the body content (issue #68)", () => {
    // The old regex stopped at the inner ``` and silently truncated the body.
    // The new line-based parser treats mid-line ``` as content, not a closer.
    const body = ["```suggestion", "text with ```suggestion inside", "```"].join("\n");
    expect(parseSuggestion(body)).toEqual({ lines: ["text with ```suggestion inside"] });
  });

  it("preserves a stray ``` run mid-line in the body content (issue #68)", () => {
    const body = ["```suggestion", "here is a fence: ```", "and more text", "```"].join("\n");
    expect(parseSuggestion(body)).toEqual({
      lines: ["here is a fence: ```", "and more text"],
    });
  });

  it("supports a 4-backtick outer fence to wrap content containing ```", () => {
    const body = ["````suggestion", "body with ``` in it", "````"].join("\n");
    expect(parseSuggestion(body)).toEqual({ lines: ["body with ``` in it"] });
  });

  it("returns null for a quoted suggestion block with no closing fence", () => {
    // prefix is non-empty but closeIdx is never found → else { return null }
    const body = ["> ```suggestion", "> const x = 1;"].join("\n");
    expect(parseSuggestion(body)).toBeNull();
  });
});

describe("isCommittableSuggestion", () => {
  it("returns true for a clean suggestion", () => {
    expect(isCommittableSuggestion({ lines: ["const x = 1;"] })).toBe(true);
  });

  it("returns true for an empty suggestion (deletion)", () => {
    expect(isCommittableSuggestion({ lines: [] })).toBe(true);
  });

  it("returns false when replacement contains a nested ```suggestion marker", () => {
    expect(isCommittableSuggestion({ lines: ["text with ```suggestion inside"] })).toBe(false);
  });

  it("returns false when replacement has an odd number of ``` runs (unmatched fence)", () => {
    expect(isCommittableSuggestion({ lines: ["here is a fence: ```", "no close"] })).toBe(false);
  });

  it("returns true when replacement contains a balanced pair of ``` runs", () => {
    expect(isCommittableSuggestion({ lines: ["```js", "code", "```"] })).toBe(true);
  });
});

describe("applySuggestionToFile", () => {
  it("replaces a single line in a newline-terminated file", () => {
    const file = "a\nb\nc\n";
    const result = applySuggestionToFile(file, 2, 2, ["B"]);
    expect(result).toBe("a\nB\nc\n");
  });

  it("replaces a line range with a multi-line suggestion", () => {
    const file = "a\nb\nc\nd\n";
    const result = applySuggestionToFile(file, 2, 3, ["X", "Y", "Z"]);
    expect(result).toBe("a\nX\nY\nZ\nd\n");
  });

  it("deletes lines when replacement is the empty array", () => {
    const file = "a\nb\nc\nd\n";
    const result = applySuggestionToFile(file, 2, 3, []);
    expect(result).toBe("a\nd\n");
  });

  it('replaces lines with a single blank line when replacement is [""]', () => {
    const file = "a\nb\nc\n";
    const result = applySuggestionToFile(file, 2, 2, [""]);
    expect(result).toBe("a\n\nc\n");
  });

  it("preserves no-trailing-newline files", () => {
    const file = "a\nb\nc";
    const result = applySuggestionToFile(file, 2, 2, ["B"]);
    expect(result).toBe("a\nB\nc");
  });

  it("replaces the first line", () => {
    const file = "a\nb\nc\n";
    const result = applySuggestionToFile(file, 1, 1, ["A"]);
    expect(result).toBe("A\nb\nc\n");
  });

  it("replaces the last line (no trailing newline)", () => {
    const file = "a\nb\nc";
    const result = applySuggestionToFile(file, 3, 3, ["C"]);
    expect(result).toBe("a\nb\nC");
  });

  it("throws when the range is out of bounds", () => {
    expect(() => applySuggestionToFile("a\nb\n", 1, 5, ["X"])).toThrow(/out of range/);
  });

  it("throws for invalid ranges", () => {
    expect(() => applySuggestionToFile("a\n", 0, 1, ["X"])).toThrow(/Invalid line range/);
    expect(() => applySuggestionToFile("a\nb\n", 3, 2, ["X"])).toThrow(/Invalid line range/);
  });
});
