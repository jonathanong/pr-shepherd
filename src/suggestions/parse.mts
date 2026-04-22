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

// Allow ```suggestion (with optional trailing chars on the same line, and
// optional leading whitespace for nested/indented blocks in quoted replies).
// [\s\S] matches any char including newline; non-greedy so the first closing
// ``` wins (matches GitHub's "take the first block" behaviour).
const SUGGESTION_BLOCK = /(^|\n)[ \t>]*```suggestion[^\n]*\n([\s\S]*?)\n[ \t>]*```/;

export interface ParsedSuggestion {
  /** Replacement text verbatim, with the fenced block's trailing newline stripped. May be the empty string (means: delete these lines). */
  replacement: string;
}

/**
 * Return the first ```suggestion block from a review-comment body, or null if none.
 *
 * The returned `replacement` is the block body with the terminating newline
 * (the one immediately before the closing ```) stripped — matching GitHub's
 * own commit-suggestion semantics where the closing fence is syntax, not content.
 */
export function parseSuggestion(body: string): ParsedSuggestion | null {
  const match = SUGGESTION_BLOCK.exec(body);
  if (!match) return null;
  // Strip leading `> ` markers that appear when a suggestion is inside a
  // quoted reply (e.g. when bots embed the original review comment).
  const raw = match[2] ?? "";
  const cleaned = raw
    .split("\n")
    .map((line) => line.replace(/^[ \t]*>[ \t]?/, ""))
    .join("\n");
  return { replacement: cleaned };
}

/**
 * Apply a suggestion to a file's full contents by replacing lines
 * [startLine..endLine] (1-indexed, inclusive) with the replacement text.
 *
 * If the suggestion replacement is the empty string, the lines are deleted.
 * The file's trailing-newline state is preserved.
 */
export function applySuggestionToFile(
  fileContent: string,
  startLine: number,
  endLine: number,
  replacement: string,
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
  // An empty replacement means "delete these lines" — don't splice an empty string in.
  const replacementLines = replacement === "" ? [] : replacement.split("\n");
  const result = [...before, ...replacementLines, ...after].join("\n");
  return endsWithNewline ? `${result}\n` : result;
}
