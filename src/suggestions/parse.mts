/**
 * Parse GitHub review-comment "suggestion" blocks.
 *
 * GitHub's "Commit suggestion" UI button treats the first ```suggestion fenced
 * block in a review comment as a replacement for the commented line range.
 * This module extracts that block from the comment body, plus applies a
 * parsed suggestion to a file's contents.
 *
 * There is no GitHub API for applying suggestions — tools that reproduce the
 * button (this one included) must parse + commit themselves.
 */

// Capture the opening prefix (indent / `>` quote markers) so the same prefix
// can be required before the closing fence via a backreference. Lazy on the
// prefix so same-line-indent blocks outside a quote aren't swallowed.
// Lazy body with no mandatory newline before the closing fence — this lets
// empty blocks (deletion) match and preserves the body's own trailing \n so
// the caller can distinguish "delete these lines" from "replace with a blank
// line" (raw="" vs raw="\n").
const SUGGESTION_BLOCK = /(^|\n)([ \t>]*?)```suggestion[^\n]*\n([\s\S]*?)\2```/;

export interface ParsedSuggestion {
  /**
   * Replacement lines to splice in. Empty array means "delete these lines".
   * `[""]` means "replace with a single blank line". Array length equals the
   * number of replacement lines in the suggestion snippet (not the number of
   * lines in the resulting file).
   */
  lines: readonly string[];
}

/**
 * Return the first ```suggestion block from a review-comment body, or null if none.
 *
 * Handles three distinct cases:
 *   - Empty block (` ```suggestion\n``` `) → `lines: []` (deletion).
 *   - Blank-line-only body (` ```suggestion\n\n``` `) → `lines: [""]`.
 *   - Non-empty body → split into lines, dropping the single trailing `\n`
 *     that acts as a line terminator rather than an extra blank line.
 *
 * When the block is embedded in a quoted reply (e.g. `> ```suggestion …`),
 * the leading prefix captured from the opening fence is stripped from each
 * body line — but only when that exact prefix is present, so legitimate `>`
 * characters inside the suggested code survive.
 */
export function parseSuggestion(body: string): ParsedSuggestion | null {
  const match = SUGGESTION_BLOCK.exec(body);
  if (!match) return null;
  const prefix = match[2] ?? "";
  const raw = match[3] ?? "";

  // Raw truly empty → the block had no body at all, which GitHub treats as
  // "delete the commented lines".
  if (raw === "") return { lines: [] };

  const unindented =
    prefix === ""
      ? raw
      : raw
          .split("\n")
          .map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : line))
          .join("\n");

  // Strip exactly one trailing \n — it's the line terminator of the last body
  // line, not an extra blank line. An explicit trailing blank is represented
  // by two trailing \ns, which leave one behind after this strip.
  const stripped = unindented.endsWith("\n") ? unindented.slice(0, -1) : unindented;
  return { lines: stripped.split("\n") };
}

/**
 * Apply a suggestion to a file's full contents by replacing lines
 * [startLine..endLine] (1-indexed, inclusive) with the given replacement lines.
 *
 * Pass `[]` to delete the range, `[""]` to replace with a single blank line,
 * or `["a", "b", ...]` for arbitrary replacements. The file's trailing-newline
 * state is preserved exactly.
 */
export function applySuggestionToFile(
  fileContent: string,
  startLine: number,
  endLine: number,
  replacementLines: readonly string[],
): string {
  if (startLine < 1 || endLine < startLine) {
    throw new Error(`Invalid line range: start=${startLine}, end=${endLine}`);
  }
  const endsWithNewline = fileContent.endsWith("\n");
  // Strip a single trailing \n so split/join round-trips exactly.
  const body = endsWithNewline ? fileContent.slice(0, -1) : fileContent;
  const lines = body.split("\n");
  if (endLine > lines.length) {
    throw new Error(`Line ${endLine} is out of range (file has ${lines.length} line(s))`);
  }
  const before = lines.slice(0, startLine - 1);
  const after = lines.slice(endLine);
  const result = [...before, ...replacementLines, ...after].join("\n");
  return endsWithNewline ? `${result}\n` : result;
}
