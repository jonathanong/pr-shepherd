export const normalizeLine = (line: string): string =>
  line.endsWith("\r") ? line.slice(0, -1) : line;

export function linesEqual(left: readonly string[], right: readonly string[]): boolean {
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
  const maxLeading = Math.min(startLine - 1, replacementLines.length);
  let leadingLength = 0;
  leading: for (let length = maxLeading; length >= 1; length--) {
    for (let index = 0; index < length; index++) {
      if (
        normalizeLine(replacementLines[index]!) !==
        normalizeLine(fileLines[startLine - 1 - length + index]!)
      ) {
        continue leading;
      }
    }
    if (
      leadingMayBeAnchor &&
      !retainsBoundaryAnchor(replacementLines.slice(length), removedLines)
    ) {
      continue;
    }
    leadingLength = length;
    break;
  }

  const remainder = replacementLines.slice(leadingLength);
  const trailingMayBeAnchor =
    removedLines.length > 0 && linesEqual(remainder.slice(-removedLines.length), removedLines);
  const maxTrailing = Math.min(fileLines.length - endLine, remainder.length);
  let trailingLength = 0;
  trailing: for (let length = maxTrailing; length >= 1; length--) {
    for (let index = 0; index < length; index++) {
      if (
        normalizeLine(remainder[remainder.length - length + index]!) !==
        normalizeLine(fileLines[endLine + index]!)
      ) {
        continue trailing;
      }
    }
    if (trailingMayBeAnchor && !retainsBoundaryAnchor(remainder.slice(0, -length), removedLines)) {
      continue;
    }
    trailingLength = length;
    break;
  }

  if (leadingLength === 0 && trailingLength === 0) return replacementLines;
  return trailingLength === 0 ? remainder : remainder.slice(0, -trailingLength);
}
