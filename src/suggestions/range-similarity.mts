import { normalizeLine } from "./lines.mts";

// Range metadata cannot distinguish an intentional near-duplicate insertion
// from a copied-and-edited adjacent block. Require a substantive shared affix;
// ambiguous matches take the manual path instead of producing a risky patch.
function closelyRewritesText(replacement: string, adjacent: string): boolean {
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

function normalizeBlockText(lines: readonly string[]): string {
  return lines.map(normalizeLine).join(" ").trim().replace(/\s+/g, " ");
}

function normalizeSharedLine(line: string): string {
  return normalizeLine(line).trim().replace(/\s+/g, " ");
}

function sharedInternalRunAt(
  replacementLines: readonly string[],
  adjacentLines: readonly string[],
  replacementStart: number,
  adjacentStart: number,
): readonly string[] {
  const sharedLines: string[] = [];
  while (
    replacementStart + sharedLines.length < replacementLines.length - 1 &&
    adjacentStart + sharedLines.length < adjacentLines.length - 1
  ) {
    const replacement = normalizeSharedLine(
      replacementLines[replacementStart + sharedLines.length]!,
    );
    const adjacent = normalizeSharedLine(adjacentLines[adjacentStart + sharedLines.length]!);
    if (replacement !== adjacent) break;
    sharedLines.push(replacement);
  }
  return sharedLines;
}

function isSubstantiveSharedRun(sharedLines: readonly string[]): boolean {
  return (
    sharedLines.length >= 2 &&
    sharedLines.every((line) => /[A-Za-z0-9]/.test(line) && line.replace(/\s/g, "").length >= 8) &&
    sharedLines.join("").replace(/\s/g, "").length >= 24
  );
}

function hasSubstantiveInternalOverlap(
  replacementLines: readonly string[],
  adjacentLines: readonly string[],
): boolean {
  if (replacementLines.length < 4 || adjacentLines.length < 4) return false;
  for (
    let replacementStart = 1;
    replacementStart < replacementLines.length - 1;
    replacementStart++
  ) {
    for (let adjacentStart = 1; adjacentStart < adjacentLines.length - 1; adjacentStart++) {
      if (
        isSubstantiveSharedRun(
          sharedInternalRunAt(replacementLines, adjacentLines, replacementStart, adjacentStart),
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

export function likelyRewritesAdjacentSpan(
  replacementLines: readonly string[],
  adjacentLines: readonly string[],
  allowSingleLinePair: boolean,
): boolean {
  if (replacementLines.length === 0 || adjacentLines.length === 0) return false;
  if (!allowSingleLinePair && replacementLines.length === 1 && adjacentLines.length === 1) {
    return false;
  }
  const replacement = normalizeBlockText(replacementLines);
  const adjacent = normalizeBlockText(adjacentLines);
  return (
    replacement === adjacent ||
    closelyRewritesText(replacement, adjacent) ||
    hasSubstantiveInternalOverlap(replacementLines, adjacentLines)
  );
}
