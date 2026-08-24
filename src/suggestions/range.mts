const normalizeLine = (line: string): string => (line.endsWith("\r") ? line.slice(0, -1) : line);

function splitFileLines(originalContent: string): string[] {
  const body = originalContent.endsWith("\n") ? originalContent.slice(0, -1) : originalContent;
  return body === "" ? [] : body.split("\n");
}

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
    if (linesEqual(leadingAnchor, removedLines) || linesEqual(trailingAnchor, removedLines)) {
      return "The replacement reproduces the complete anchored range while extending beyond it.";
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
