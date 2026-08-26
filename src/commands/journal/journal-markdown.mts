import { SHEPHERD_JOURNAL_DETAILS_CLOSE } from "../shepherd-journal.mts";

type Fence = { marker: "`" | "~"; length: number };
export type MarkdownScanState = { comment: boolean; fence: Fence | null };

export function findDetailsClose(lines: string[], startIdx: number): number {
  let depth = 1;
  const state: MarkdownScanState = { fence: null, comment: false };
  for (let i = startIdx; i < lines.length; i++) {
    if (skipMarkdownLine(state, lines[i]!)) continue;
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

function advanceHtmlComment(active: boolean, line: string): boolean {
  return active ? !line.includes("-->") : line.includes("<!--") && !line.includes("-->");
}

export function skipMarkdownLine(state: MarkdownScanState, line: string): boolean {
  if (state.comment) {
    state.comment = advanceHtmlComment(true, line);
    return true;
  }
  if (state.fence) {
    state.fence = advanceFence(state.fence, line);
    return true;
  }
  if (line.includes("<!--")) {
    state.comment = advanceHtmlComment(false, line);
    return true;
  }
  state.fence = advanceFence(null, line);
  return state.fence !== null;
}

function advanceFence(activeFence: Fence | null, line: string): Fence | null {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
  if (!activeFence) {
    if (match?.[1]![0] === "`" && match[2]!.includes("`")) return null;
    return match ? { marker: match[1]![0]! as Fence["marker"], length: match[1]!.length } : null;
  }
  return match &&
    match[1]![0] === activeFence.marker &&
    match[1]!.length >= activeFence.length &&
    /^[ \t]*$/.test(match[2]!)
    ? null
    : activeFence;
}
