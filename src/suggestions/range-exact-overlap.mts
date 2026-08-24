import { normalizeLine } from "./lines.mts";

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

export function sharesExactProperPrefix(
  replacementLines: readonly string[],
  adjacentLines: readonly string[],
): boolean {
  const sharedLength = sharedExactPrefixLength(replacementLines, adjacentLines);
  return sharedLength > 0 && sharedLength < replacementLines.length;
}

export function sharesExactProperSuffix(
  replacementLines: readonly string[],
  adjacentLines: readonly string[],
): boolean {
  const sharedLength = sharedExactSuffixLength(replacementLines, adjacentLines);
  return sharedLength > 0 && sharedLength < replacementLines.length;
}
