import { normalizeLine } from "./lines.mts";

export const hasLetterOrNumber = (line: string): boolean => /[\p{L}\p{N}]/u.test(line);

export const isSubstantiveLine = (line: string): boolean =>
  hasLetterOrNumber(line) && line.replace(/\s/g, "").length >= 8;

export function isSubstantiveSharedRun(sharedLines: readonly string[]): boolean {
  const substantiveLines = sharedLines.filter(isSubstantiveLine);
  return substantiveLines.length >= 2 && substantiveLines.join("").replace(/\s/g, "").length >= 24;
}

export function isSubstantiveExactAlignedBlock(
  candidate: readonly string[],
  adjacentLines: readonly string[],
): boolean {
  return (
    isSubstantiveSharedRun(candidate) &&
    candidate.every(
      (line, index) =>
        normalizeLine(line).trim().replace(/\s+/g, " ") ===
        normalizeLine(adjacentLines[index]!).trim().replace(/\s+/g, " "),
    )
  );
}
