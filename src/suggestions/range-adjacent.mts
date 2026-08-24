import { normalizeLine } from "./lines.mts";
import { findLineSequenceOffsets } from "./range-anchor.mts";
import {
  likelyRewritesChangedLineSubrange,
  likelyRewritesAdjacentSpan,
} from "./range-similarity.mts";

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
  if (
    adjacentSpans.some((span) =>
      likelyRewritesAdjacentSpan(replacementLines, span, allowSingleLinePair),
    )
  ) {
    return true;
  }
  return likelyRewritesChangedLineSubrange(replacementLines, adjacentSpans);
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

function extensionRewritesAfter(
  fileLines: readonly string[],
  endLine: number,
  extension: readonly string[],
): boolean {
  if (extension.length === 0) return false;
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

function extensionRewritesBefore(
  fileLines: readonly string[],
  startLine: number,
  extension: readonly string[],
): boolean {
  if (extension.length === 0) return false;
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

function retainedAnchorRewriteDirection(
  fileLines: readonly string[],
  removedLines: readonly string[],
  startLine: number,
  endLine: number,
  replacementLines: readonly string[],
): "before" | "after" | "ambiguous" | null {
  const offsets = findLineSequenceOffsets(replacementLines, removedLines);
  // Bound repeated extension scans while rejecting ambiguous bodies safely.
  if (offsets.length * replacementLines.length > 4_096) return "ambiguous";
  for (const offset of offsets) {
    const before = replacementLines.slice(0, offset);
    const after = replacementLines.slice(offset + removedLines.length);
    if (extensionRewritesAfter(fileLines, endLine, after)) return "after";
    if (extensionRewritesBefore(fileLines, startLine, before)) return "before";
  }
  return null;
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
  const retainedAnchorDirection = retainedAnchorRewriteDirection(
    fileLines,
    removedLines,
    startLine,
    endLine,
    replacementLines,
  );
  if (retainedAnchorDirection === "after") {
    return "The replacement retains the complete anchored range and appears to rewrite source immediately after it.";
  }
  if (retainedAnchorDirection === "before") {
    return "The replacement retains the complete anchored range and appears to rewrite source immediately before it.";
  }
  if (retainedAnchorDirection === "ambiguous") {
    return "The replacement repeats the complete anchored range too many times to validate its surrounding source safely.";
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
