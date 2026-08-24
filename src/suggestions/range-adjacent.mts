import { findLineSequenceOffsets } from "./range-anchor.mts";
import { sharesExactProperPrefix, sharesExactProperSuffix } from "./range-exact-overlap.mts";
import {
  likelyRewritesChangedLineSubrange,
  likelyRewritesAdjacentSpan,
} from "./range-similarity.mts";
import { createScanWorkBudget, type ChargeScanWork } from "./range-work.mts";

function adjacentSpansBefore(
  fileLines: readonly string[],
  startLine: number,
  replacementLineCount: number,
): readonly string[][] {
  const endIndex = startLine - 1;
  const limit = Math.min(endIndex, Math.max(2, replacementLineCount * 2));
  return Array.from({ length: limit }, (_, index) =>
    fileLines.slice(endIndex - index - 1, endIndex),
  );
}

function adjacentSpansAfter(
  fileLines: readonly string[],
  endLine: number,
  replacementLineCount: number,
): readonly string[][] {
  const limit = Math.min(fileLines.length - endLine, Math.max(2, replacementLineCount * 2));
  return Array.from({ length: limit }, (_, index) => fileLines.slice(endLine, endLine + index + 1));
}

function likelyRewritesAdjacentSource(
  replacementLines: readonly string[],
  adjacentSpans: readonly (readonly string[])[],
  allowSingleLinePair: boolean,
): boolean {
  if (
    adjacentSpans
      .slice(0, 8)
      .some((span) => likelyRewritesAdjacentSpan(replacementLines, span, allowSingleLinePair))
  ) {
    return true;
  }
  return likelyRewritesChangedLineSubrange(replacementLines, adjacentSpans);
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
  chargeScanWork: ChargeScanWork,
): "before" | "after" | "ambiguous" | "work" | "safe" | null {
  const offsets = findLineSequenceOffsets(replacementLines, removedLines);
  // Bound repeated extension scans while rejecting ambiguous bodies safely.
  if (offsets.length * replacementLines.length > 4_096) return "ambiguous";
  if (offsets.length === 0) return null;
  for (const offset of offsets) {
    const before = replacementLines.slice(0, offset);
    const after = replacementLines.slice(offset + removedLines.length);
    if (chargeScanWork(after.length, fileLines.length - endLine)) return "work";
    if (extensionRewritesAfter(fileLines, endLine, after)) return "after";
    if (chargeScanWork(after.length, startLine - 1)) return "work";
    if (extensionRewritesBefore(fileLines, startLine, after)) return "before";
    if (chargeScanWork(before.length, startLine - 1)) return "work";
    if (extensionRewritesBefore(fileLines, startLine, before)) return "before";
    if (chargeScanWork(before.length, fileLines.length - endLine)) return "work";
    if (extensionRewritesAfter(fileLines, endLine, before)) return "after";
  }
  return "safe";
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
  const chargeScanWork = createScanWorkBudget();
  const retainedAnchorDirection = retainedAnchorRewriteDirection(
    fileLines,
    removedLines,
    startLine,
    endLine,
    replacementLines,
    chargeScanWork,
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
  if (retainedAnchorDirection === "work") {
    return "The replacement and adjacent source require too much similarity work to validate the anchored range safely.";
  }
  if (retainedAnchorDirection === "safe") return null;
  if (chargeScanWork(replacementLines.length, startLine - 1)) {
    return "The replacement and adjacent source require too much similarity work to validate the anchored range safely.";
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
  if (chargeScanWork(replacementLines.length, fileLines.length - endLine)) {
    return "The replacement and adjacent source require too much similarity work to validate the anchored range safely.";
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
