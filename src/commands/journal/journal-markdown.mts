import { SHEPHERD_JOURNAL_DETAILS_CLOSE } from "../shepherd-journal.mts";

export type Fence = { marker: "`" | "~"; length: number };

export function findDetailsClose(lines: string[], startIdx: number): number {
  let depth = 1;
  let fence: Fence | null = null;
  for (let i = startIdx; i < lines.length; i++) {
    fence = advanceFence(fence, lines[i]!);
    if (fence) continue;
    if (isJournalLikeSummary(lines[i]!.trimStart())) {
      throw new Error("duplicate Shepherd Journal details summary inside canonical container");
    }
    if (isDetailsOpening(lines[i]!)) depth++;
    if (lines[i]!.trim() === SHEPHERD_JOURNAL_DETAILS_CLOSE) {
      if (lines[i] !== SHEPHERD_JOURNAL_DETAILS_CLOSE) {
        throw new Error(
          "malformed Shepherd Journal details container: closing marker must be unindented",
        );
      }
      if (--depth === 0) return i;
    }
  }
  throw new Error("unterminated or unsafe nested Shepherd Journal details container");
}

export function isJournalLikeSummary(line: string): boolean {
  return /^<summary>\s*Shepherd\s+Journal\b/i.test(line);
}

function isDetailsOpening(line: string): boolean {
  return /^<details(?:\s+[^>]*)?>$/.test(line);
}

export function advanceFence(activeFence: Fence | null, line: string): Fence | null {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
  if (!activeFence) {
    return match ? { marker: match[1]![0]! as Fence["marker"], length: match[1]!.length } : null;
  }
  return match &&
    match[1]![0] === activeFence.marker &&
    match[1]!.length >= activeFence.length &&
    /^[ \t]*$/.test(match[2]!)
    ? null
    : activeFence;
}
