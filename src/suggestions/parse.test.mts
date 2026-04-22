import { describe, it, expect } from "vitest";
import { parseSuggestion, applySuggestionToFile } from "./parse.mts";

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
