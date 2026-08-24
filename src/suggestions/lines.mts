export const normalizeLine = (line: string): string =>
  line.endsWith("\r") ? line.slice(0, -1) : line;

function linesEqual(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((line, index) => normalizeLine(line) === normalizeLine(right[index]!))
  );
}

export function splitFileLines(originalContent: string): string[] {
  const body = originalContent.endsWith("\n") ? originalContent.slice(0, -1) : originalContent;
  return originalContent === "" ? [] : body.split("\n");
}

function retainsBoundaryAnchor(
  replacementLines: readonly string[],
  removedLines: readonly string[],
): boolean {
  return (
    removedLines.length > 0 &&
    (linesEqual(replacementLines.slice(0, removedLines.length), removedLines) ||
      linesEqual(replacementLines.slice(-removedLines.length), removedLines))
  );
}

function largestPermittedContextTrim({
  maxLength,
  matchesContext,
  remainingAfterTrim,
  mustRetainAnchor,
  removedLines,
}: {
  maxLength: number;
  matchesContext: (length: number) => boolean;
  remainingAfterTrim: (length: number) => readonly string[];
  mustRetainAnchor: boolean;
  removedLines: readonly string[];
}): number {
  for (let length = maxLength; length >= 1; length--) {
    if (!matchesContext(length)) continue;
    if (mustRetainAnchor && !retainsBoundaryAnchor(remainingAfterTrim(length), removedLines)) {
      continue;
    }
    return length;
  }
  return 0;
}

/**
 * Strip leading/trailing replacement lines that exactly duplicate file lines
 * immediately outside the anchored range.
 */
export function trimReplacementToContext(
  fileLines: readonly string[],
  startLine: number,
  endLine: number,
  replacementLines: readonly string[],
): readonly string[] {
  const removedLines = fileLines.slice(startLine - 1, endLine);
  const leadingMayBeAnchor =
    removedLines.length > 0 &&
    linesEqual(replacementLines.slice(0, removedLines.length), removedLines);
  const leadingLength = largestPermittedContextTrim({
    maxLength: Math.min(startLine - 1, replacementLines.length),
    matchesContext: (length) =>
      linesEqual(
        replacementLines.slice(0, length),
        fileLines.slice(startLine - 1 - length, startLine - 1),
      ),
    remainingAfterTrim: (length) => replacementLines.slice(length),
    mustRetainAnchor: leadingMayBeAnchor,
    removedLines,
  });

  const remainder = replacementLines.slice(leadingLength);
  const trailingMayBeAnchor =
    removedLines.length > 0 && linesEqual(remainder.slice(-removedLines.length), removedLines);
  const trailingLength = largestPermittedContextTrim({
    maxLength: Math.min(fileLines.length - endLine, remainder.length),
    matchesContext: (length) =>
      linesEqual(remainder.slice(-length), fileLines.slice(endLine, endLine + length)),
    remainingAfterTrim: (length) => remainder.slice(0, -length),
    mustRetainAnchor: trailingMayBeAnchor,
    removedLines,
  });

  if (leadingLength === 0 && trailingLength === 0) return replacementLines;
  return trailingLength === 0 ? remainder : remainder.slice(0, -trailingLength);
}
