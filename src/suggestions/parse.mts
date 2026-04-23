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
 *   - Non-empty body → split into lines.
 *
 * The opening fence may be 3+ backticks; the closing fence must be at least
 * as many backticks, at the start of a line (after the captured prefix). This
 * means content lines that contain ` ``` ` in the middle (not at line-start)
 * are treated as content rather than a closing fence — fixing the silent
 * truncation in the original regex approach (issue #68).
 *
 * When the block is embedded in a quoted reply (e.g. `> ```suggestion …`),
 * the leading prefix captured from the opening fence is stripped from each
 * body line — but only when that exact prefix is present, so legitimate `>`
 * characters inside the suggested code survive.
 */
export function parseSuggestion(body: string): ParsedSuggestion | null {
  const lines = body.split("\n");

  // Find the opening fence: optional prefix + N backticks (N≥3) + "suggestion" + anything.
  let openIdx = -1;
  let prefix = "";
  let fenceLen = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = /^([ \t>]*?)(`{3,})suggestion[^\n]*$/.exec(lines[i]!);
    if (m) {
      openIdx = i;
      prefix = m[1]!;
      fenceLen = m[2]!.length;
      break;
    }
  }
  if (openIdx === -1) return null;

  // Find the closing fence: same prefix + N+ backticks at the start of a line.
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const closeRegex = new RegExp(`^${escapedPrefix}\`{${fenceLen},}[ \\t]*$`);
  let closeIdx = -1;
  for (let i = openIdx + 1; i < lines.length; i++) {
    if (closeRegex.test(lines[i]!)) {
      closeIdx = i;
      break;
    }
  }

  let bodyLines: string[];
  if (closeIdx !== -1) {
    bodyLines = lines.slice(openIdx + 1, closeIdx);
  } else if (prefix === "" && lines.length > openIdx + 1) {
    // Inline-close fallback: last line ends with N+ backticks (no trailing newline).
    // Preserves the historical behaviour for bodies like "```suggestion\nfoo```".
    // Only supported for non-quoted (prefix="") blocks.
    const last = lines[lines.length - 1]!;
    const m = new RegExp(`^(.*?)\`{${fenceLen},}$`).exec(last);
    if (!m) return null;
    bodyLines = [...lines.slice(openIdx + 1, lines.length - 1), m[1]!];
  } else {
    return null;
  }

  if (bodyLines.length === 0) return { lines: [] };

  const cleaned =
    prefix === ""
      ? bodyLines
      : bodyLines.map((l) => (l.startsWith(prefix) ? l.slice(prefix.length) : l));
  return { lines: cleaned };
}

/**
 * True when a parsed suggestion's replacement is safe to commit: the joined
 * replacement contains no nested ` ```suggestion ` marker and no unmatched
 * ` ``` ` run (odd count). Both shapes previously masked silent truncation
 * (issue #68). Conservative by design: reviewers whose suggestion content
 * legitimately includes these markers must apply the change manually.
 */
export function isCommittableSuggestion(parsed: ParsedSuggestion): boolean {
  const replacement = parsed.lines.join("\n");
  if (replacement.includes("```suggestion")) return false;
  const fenceRuns = (replacement.match(/`{3,}/g) ?? []).length;
  return fenceRuns % 2 === 0;
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
