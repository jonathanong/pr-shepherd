import { normalizeLine, splitFileLines } from "./lines.mts";

function linesEqual(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((line, index) => normalizeLine(line) === normalizeLine(right[index]!))
  );
}

function partiallyRewritesAdjacentBlock(
  replacementLines: readonly string[],
  adjacentLines: readonly string[],
): boolean {
  if (replacementLines.length < 3 || replacementLines.length !== adjacentLines.length) {
    return false;
  }
  if (
    normalizeLine(replacementLines[0]!) !== normalizeLine(adjacentLines[0]!) ||
    normalizeLine(replacementLines.at(-1)!) !== normalizeLine(adjacentLines.at(-1)!)
  ) {
    return false;
  }
  return !linesEqual(replacementLines, adjacentLines);
}

function closelyRewritesLine(replacementLine: string, adjacentLine: string): boolean {
  const replacement = normalizeLine(replacementLine);
  const adjacent = normalizeLine(adjacentLine);
  if (replacement === adjacent) return false;

  const shorterLength = Math.min(replacement.length, adjacent.length);
  if (shorterLength < 16) return false;

  let prefixLength = 0;
  while (prefixLength < shorterLength && replacement[prefixLength] === adjacent[prefixLength]) {
    prefixLength++;
  }

  let suffixLength = 0;
  while (
    prefixLength + suffixLength < shorterLength &&
    replacement[replacement.length - 1 - suffixLength] ===
      adjacent[adjacent.length - 1 - suffixLength]
  ) {
    suffixLength++;
  }

  return prefixLength + suffixLength >= Math.ceil(shorterLength * 0.6);
}

function ambiguouslyRewritesAdjacentLines(
  replacementLines: readonly string[],
  adjacentLines: readonly string[],
): boolean {
  return (
    replacementLines.length > 0 &&
    replacementLines.length === adjacentLines.length &&
    !linesEqual(replacementLines, adjacentLines) &&
    replacementLines.some((line, index) => closelyRewritesLine(line, adjacentLines[index]!))
  );
}

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
  if (replacementLines.length > removedLines.length) {
    const leadingAnchor = replacementLines.slice(0, removedLines.length);
    const trailingAnchor = replacementLines.slice(-removedLines.length);
    if (linesEqual(leadingAnchor, removedLines)) {
      const extension = replacementLines.slice(removedLines.length);
      const adjacentLines = fileLines.slice(endLine, endLine + extension.length);
      if (ambiguouslyRewritesAdjacentLines(extension, adjacentLines)) {
        return "The replacement retains the complete anchored range and appears to rewrite source immediately after it.";
      }
    }
    if (linesEqual(trailingAnchor, removedLines)) {
      const extension = replacementLines.slice(0, -removedLines.length);
      const adjacentStart = startLine - 1 - extension.length;
      const adjacentLines = adjacentStart < 0 ? [] : fileLines.slice(adjacentStart, startLine - 1);
      if (ambiguouslyRewritesAdjacentLines(extension, adjacentLines)) {
        return "The replacement retains the complete anchored range and appears to rewrite source immediately before it.";
      }
    }
  }

  const beforeStart = startLine - 1 - replacementLines.length;
  if (beforeStart >= 0) {
    const beforeRange = fileLines.slice(beforeStart, startLine - 1);
    if (partiallyRewritesAdjacentBlock(replacementLines, beforeRange)) {
      return "The replacement partially rewrites a source block before the anchored range.";
    }
  }

  const afterEnd = endLine + replacementLines.length;
  if (afterEnd <= fileLines.length) {
    const afterRange = fileLines.slice(endLine, afterEnd);
    if (partiallyRewritesAdjacentBlock(replacementLines, afterRange)) {
      return "The replacement partially rewrites a source block after the anchored range.";
    }
  }
  return null;
}
