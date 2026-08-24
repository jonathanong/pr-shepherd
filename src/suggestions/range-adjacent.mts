import { linesEqual, normalizeLine } from "./lines.mts";
import { likelyRewritesAdjacentSpan } from "./range-similarity.mts";

function adjacentSpansBefore(
  fileLines: readonly string[],
  startLine: number,
  replacementLineCount: number,
): readonly string[][] {
  const endIndex = startLine - 1;
  const limit = Math.min(endIndex, 8, Math.max(2, replacementLineCount * 2));
  return Array.from({ length: limit }, (_, index) =>
    fileLines.slice(endIndex - index - 1, endIndex),
  );
}

function adjacentSpansAfter(
  fileLines: readonly string[],
  endLine: number,
  replacementLineCount: number,
): readonly string[][] {
  const limit = Math.min(fileLines.length - endLine, 8, Math.max(2, replacementLineCount * 2));
  return Array.from({ length: limit }, (_, index) => fileLines.slice(endLine, endLine + index + 1));
}

function likelyRewritesAdjacentSource(
  replacementLines: readonly string[],
  adjacentSpans: readonly (readonly string[])[],
  allowSingleLinePair: boolean,
): boolean {
  return adjacentSpans.some((span) =>
    likelyRewritesAdjacentSpan(replacementLines, span, allowSingleLinePair),
  );
}

function sharedExactPrefixLength(
  replacementLines: readonly string[],
  adjacentLines: readonly string[],
): number {
  const limit = Math.min(replacementLines.length, adjacentLines.length);
  let length = 0;
  while (
    length < limit &&
    normalizeLine(replacementLines[length]!) === normalizeLine(adjacentLines[length]!)
  ) {
    length++;
  }
  return length;
}

function sharedExactSuffixLength(
  replacementLines: readonly string[],
  adjacentLines: readonly string[],
): number {
  const limit = Math.min(replacementLines.length, adjacentLines.length);
  let length = 0;
  while (
    length < limit &&
    normalizeLine(replacementLines[replacementLines.length - 1 - length]!) ===
      normalizeLine(adjacentLines[adjacentLines.length - 1 - length]!)
  ) {
    length++;
  }
  return length;
}

function sharesExactProperPrefix(
  replacementLines: readonly string[],
  adjacentLines: readonly string[],
): boolean {
  const sharedLength = sharedExactPrefixLength(replacementLines, adjacentLines);
  return sharedLength > 0 && sharedLength < replacementLines.length;
}

function sharesExactProperSuffix(
  replacementLines: readonly string[],
  adjacentLines: readonly string[],
): boolean {
  const sharedLength = sharedExactSuffixLength(replacementLines, adjacentLines);
  return sharedLength > 0 && sharedLength < replacementLines.length;
}

function retainedAnchorRewritesAfter(
  fileLines: readonly string[],
  removedLines: readonly string[],
  endLine: number,
  replacementLines: readonly string[],
): boolean {
  if (replacementLines.length <= removedLines.length) return false;
  const leadingAnchor = replacementLines.slice(0, removedLines.length);
  if (!linesEqual(leadingAnchor, removedLines)) return false;
  const extension = replacementLines.slice(removedLines.length);
  const adjacentLines = fileLines.slice(endLine, endLine + extension.length);
  return (
    sharesExactProperPrefix(extension, adjacentLines) ||
    likelyRewritesAdjacentSource(
      extension,
      adjacentSpansAfter(fileLines, endLine, extension.length),
      true,
    )
  );
}

function retainedAnchorRewritesBefore(
  fileLines: readonly string[],
  removedLines: readonly string[],
  startLine: number,
  replacementLines: readonly string[],
): boolean {
  if (replacementLines.length <= removedLines.length) return false;
  const trailingAnchor = replacementLines.slice(-removedLines.length);
  if (!linesEqual(trailingAnchor, removedLines)) return false;
  const extension = replacementLines.slice(0, -removedLines.length);
  const adjacentStart = startLine - 1 - extension.length;
  const adjacentLines = fileLines.slice(Math.max(0, adjacentStart), startLine - 1);
  return (
    sharesExactProperSuffix(extension, adjacentLines) ||
    likelyRewritesAdjacentSource(
      extension,
      adjacentSpansBefore(fileLines, startLine, extension.length),
      true,
    )
  );
}

export function getAdjacentSuggestionRangeReason({
  fileLines,
  removedLines,
  startLine,
  endLine,
  replacementLines,
}: {
  fileLines: readonly string[];
  removedLines: readonly string[];
  startLine: number;
  endLine: number;
  replacementLines: readonly string[];
}): string | null {
  if (retainedAnchorRewritesAfter(fileLines, removedLines, endLine, replacementLines)) {
    return "The replacement retains the complete anchored range and appears to rewrite source immediately after it.";
  }
  if (retainedAnchorRewritesBefore(fileLines, removedLines, startLine, replacementLines)) {
    return "The replacement retains the complete anchored range and appears to rewrite source immediately before it.";
  }
  if (
    likelyRewritesAdjacentSource(
      replacementLines,
      adjacentSpansBefore(fileLines, startLine, replacementLines.length),
      false,
    )
  ) {
    return "The replacement partially rewrites a source block before the anchored range.";
  }
  if (
    likelyRewritesAdjacentSource(
      replacementLines,
      adjacentSpansAfter(fileLines, endLine, replacementLines.length),
      false,
    )
  ) {
    return "The replacement partially rewrites a source block after the anchored range.";
  }
  return null;
}
