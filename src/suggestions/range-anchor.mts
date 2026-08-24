import { normalizeLine } from "./lines.mts";

function buildPrefixTable(pattern: readonly string[]): readonly number[] {
  const table = Array.from({ length: pattern.length }, () => 0);
  let prefixLength = 0;
  for (let index = 1; index < pattern.length;) {
    if (pattern[index] === pattern[prefixLength]) {
      prefixLength++;
      table[index] = prefixLength;
      index++;
    } else if (prefixLength > 0) {
      prefixLength = table[prefixLength - 1]!;
    } else {
      index++;
    }
  }
  return table;
}

export function findLineSequenceOffsets(
  lines: readonly string[],
  sequence: readonly string[],
): readonly number[] {
  if (sequence.length === 0) return [];
  const pattern = sequence.map(normalizeLine);
  const prefixTable = buildPrefixTable(pattern);
  const offsets: number[] = [];
  let matchedLength = 0;

  for (let index = 0; index < lines.length; index++) {
    const line = normalizeLine(lines[index]!);
    while (matchedLength > 0 && line !== pattern[matchedLength]) {
      matchedLength = prefixTable[matchedLength - 1]!;
    }
    if (line === pattern[matchedLength]) matchedLength++;
    if (matchedLength !== pattern.length) continue;
    offsets.push(index - pattern.length + 1);
    matchedLength = prefixTable[matchedLength - 1]!;
  }
  return offsets;
}
