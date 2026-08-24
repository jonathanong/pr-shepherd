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

function hasLetterOrNumber(line: string): boolean {
  return /[\p{L}\p{N}]/u.test(line);
}

function isSubstantiveLine(line: string): boolean {
  return hasLetterOrNumber(line) && line.replace(/\s/g, "").length >= 8;
}

function isSubstantiveSharedRun(sharedLines: readonly string[]): boolean {
  const substantiveLines = sharedLines.filter(isSubstantiveLine);
  return substantiveLines.length >= 2 && substantiveLines.join("").replace(/\s/g, "").length >= 24;
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

function alignedLineRelation(
  replacementLine: string,
  adjacentLine: string,
): "exact" | "changed" | null {
  const replacement = normalizeSharedLine(replacementLine);
  const adjacent = normalizeSharedLine(adjacentLine);
  if (replacement === adjacent) {
    const isNeutral = replacement === "" || !hasLetterOrNumber(replacement);
    return isNeutral || isSubstantiveLine(replacementLine) ? "exact" : null;
  }
  if (!isSubstantiveLine(replacementLine) || !isSubstantiveLine(adjacentLine)) return null;
  return closelyRewritesText(replacement, adjacent) ? "changed" : null;
}

function isMixedAlignedRewrite(
  candidate: readonly string[],
  adjacentSpan: readonly string[],
): boolean {
  for (let index = 0; index < candidate.length - 1; index++) {
    const first = alignedLineRelation(candidate[index]!, adjacentSpan[index]!);
    const second = alignedLineRelation(candidate[index + 1]!, adjacentSpan[index + 1]!);
    if (
      (first === "exact" && second === "changed") ||
      (first === "changed" && second === "exact")
    ) {
      return true;
    }
  }
  return false;
}

function isChangedWithUnrelatedSubstantivePair(
  candidate: readonly string[],
  adjacentSpan: readonly string[],
): boolean {
  if (candidate.length !== 2 || adjacentSpan.length !== 2) return false;
  if (!candidate.every(isSubstantiveLine) || !adjacentSpan.every(isSubstantiveLine)) return false;
  const relations = candidate.map((line, index) => alignedLineRelation(line, adjacentSpan[index]!));
  return relations.includes("changed") && !relations.includes("exact");
}

function likelyRewritesChangedWindow(
  replacementLines: readonly string[],
  adjacentSpan: readonly string[],
): boolean {
  const length = adjacentSpan.length;
  for (let start = 0; start <= replacementLines.length - length; start++) {
    const candidate = replacementLines.slice(start, start + length);
    if (isMixedAlignedRewrite(candidate, adjacentSpan)) return true;
    if (isChangedWithUnrelatedSubstantivePair(candidate, adjacentSpan)) return true;
    if (!candidate.every(isSubstantiveLine) || !adjacentSpan.every(isSubstantiveLine)) continue;
    const hasExactLine = candidate.some(
      (line, index) => normalizeSharedLine(line) === normalizeSharedLine(adjacentSpan[index]!),
    );
    if (!hasExactLine && likelyRewritesAdjacentSpan(candidate, adjacentSpan, true)) return true;
  }
  return false;
}

export function likelyRewritesChangedLineSubrange(
  replacementLines: readonly string[],
  adjacentSpans: readonly (readonly string[])[],
): boolean {
  if (replacementLines.length < 2) return false;
  const adjacentLine = adjacentSpans.find((span) => span.length === 1)?.[0];
  if (adjacentLine !== undefined && isSubstantiveLine(adjacentLine)) {
    const adjacent = normalizeSharedLine(adjacentLine);
    if (
      replacementLines.some((line) => {
        if (!isSubstantiveLine(line)) return false;
        const replacement = normalizeSharedLine(line);
        return replacement !== adjacent && closelyRewritesText(replacement, adjacent);
      })
    ) {
      return true;
    }
  }

  const maxLength = Math.min(8, replacementLines.length);
  for (let length = 2; length <= maxLength; length++) {
    const adjacentSpan = adjacentSpans.find((span) => span.length === length);
    if (adjacentSpan === undefined) continue;
    if (likelyRewritesChangedWindow(replacementLines, adjacentSpan)) return true;
  }
  return false;
}
