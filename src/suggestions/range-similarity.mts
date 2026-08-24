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
  return replacement === adjacent || closelyRewritesText(replacement, adjacent);
}
