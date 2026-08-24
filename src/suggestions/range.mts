import { normalizeLine, splitFileLines } from "./lines.mts";

function linesEqual(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((line, index) => normalizeLine(line) === normalizeLine(right[index]!))
  );
}

// Range metadata cannot distinguish an intentional near-duplicate insertion
// from a copied-and-edited adjacent line. Require a substantive shared affix;
// ambiguous matches take the manual path instead of producing a risky patch.
function closelyRewritesLine(replacementLine: string, adjacentLine: string): boolean {
  const replacement = normalizeLine(replacementLine);
  const adjacent = normalizeLine(adjacentLine);
  if (replacement === adjacent) return false;

  const shorterLength = Math.min(replacement.length, adjacent.length);

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

  const sharedLength = prefixLength + suffixLength;
  return sharedLength >= 12 && sharedLength >= Math.ceil(shorterLength * 0.6);
}

function likelyRewritesAdjacentBlock(
  replacementLines: readonly string[],
  adjacentLines: readonly string[],
  minimumLines: number,
): boolean {
  return (
    replacementLines.length >= minimumLines &&
    replacementLines.length === adjacentLines.length &&
    replacementLines.some((line, index) => closelyRewritesLine(line, adjacentLines[index]!))
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
    likelyRewritesAdjacentBlock(extension, adjacentLines, 1)
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
    likelyRewritesAdjacentBlock(extension, adjacentLines, 1)
  );
}

function rewritesBlockBeforeAnchor(
  fileLines: readonly string[],
  startLine: number,
  replacementLines: readonly string[],
): boolean {
  const adjacentStart = startLine - 1 - replacementLines.length;
  if (adjacentStart < 0) return false;
  const adjacentLines = fileLines.slice(adjacentStart, startLine - 1);
  return likelyRewritesAdjacentBlock(replacementLines, adjacentLines, 2);
}

function rewritesBlockAfterAnchor(
  fileLines: readonly string[],
  endLine: number,
  replacementLines: readonly string[],
): boolean {
  const adjacentEnd = endLine + replacementLines.length;
  if (adjacentEnd > fileLines.length) return false;
  const adjacentLines = fileLines.slice(endLine, adjacentEnd);
  return likelyRewritesAdjacentBlock(replacementLines, adjacentLines, 2);
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
  if (retainedAnchorRewritesAfter(fileLines, removedLines, endLine, replacementLines)) {
    return "The replacement retains the complete anchored range and appears to rewrite source immediately after it.";
  }
  if (retainedAnchorRewritesBefore(fileLines, removedLines, startLine, replacementLines)) {
    return "The replacement retains the complete anchored range and appears to rewrite source immediately before it.";
  }
  if (rewritesBlockBeforeAnchor(fileLines, startLine, replacementLines)) {
    return "The replacement partially rewrites a source block before the anchored range.";
  }
  if (rewritesBlockAfterAnchor(fileLines, endLine, replacementLines)) {
    return "The replacement partially rewrites a source block after the anchored range.";
  }
  return null;
}
