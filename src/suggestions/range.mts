import { splitFileLines, trimReplacementToContext } from "./lines.mts";
import { getAdjacentSuggestionRangeReason } from "./range-adjacent.mts";

/**
 * Return why a suggestion body cannot be reconciled safely with GitHub's
 * anchored line range, or null when the exact range is safe to use.
 *
 * The range is authoritative: this validator never shifts or expands it. It
 * only detects bodies that appear to reach beyond the anchor, leaving manual
 * interpretation to the caller instead of emitting a structurally unsafe diff.
 */
export function getUnsafeSuggestionRangeReason({
  originalContent,
  startLine,
  endLine,
  replacementLines,
}: {
  originalContent: string;
  startLine: number;
  endLine: number;
  replacementLines: readonly string[];
}): string | null {
  const fileLines = splitFileLines(originalContent);
  if (
    !Number.isInteger(startLine) ||
    !Number.isInteger(endLine) ||
    startLine < 1 ||
    endLine < startLine ||
    endLine > fileLines.length
  ) {
    return `GitHub reported an invalid or out-of-bounds range (${startLine}-${endLine}) for a ${fileLines.length}-line file.`;
  }

  return getAdjacentSuggestionRangeReason({
    fileLines,
    removedLines: fileLines.slice(startLine - 1, endLine),
    startLine,
    endLine,
    replacementLines: trimReplacementToContext(fileLines, startLine, endLine, replacementLines),
  });
}
