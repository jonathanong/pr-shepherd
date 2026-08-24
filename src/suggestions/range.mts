import { analyzeReplacementContext, splitFileLines } from "./lines.mts";
import { getAdjacentSuggestionRangeReason } from "./range-adjacent.mts";
import { findLineSequenceOffsets } from "./range-anchor.mts";

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

  const removedLines = fileLines.slice(startLine - 1, endLine);
  const contextTrim = analyzeReplacementContext(fileLines, startLine, endLine, replacementLines);
  if (contextTrim.leadingLength > 0 || contextTrim.trailingLength > 0) {
    const originalOccurrences = findLineSequenceOffsets(replacementLines, removedLines).length;
    const trimmedOccurrences = findLineSequenceOffsets(
      contextTrim.replacementLines,
      removedLines,
    ).length;
    if (originalOccurrences > trimmedOccurrences) {
      return "Exact-context trimming would discard a complete copy of the anchored range, so the intended duplicate insertion is ambiguous.";
    }
  }

  return getAdjacentSuggestionRangeReason({
    fileLines,
    removedLines,
    startLine,
    endLine,
    replacementLines: contextTrim.replacementLines,
  });
}
