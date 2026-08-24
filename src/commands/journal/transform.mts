import {
  SHEPHERD_JOURNAL_DETAILS_CLOSE,
  SHEPHERD_JOURNAL_DETAILS_OPEN,
  SHEPHERD_JOURNAL_DETAILS_SUMMARY,
  SHEPHERD_JOURNAL_SECTION_PATTERN,
} from "../shepherd-journal.mts";
import {
  advanceFence,
  findDetailsClose,
  isJournalLikeSummary,
  type Fence,
} from "./journal-markdown.mts";

export interface AppendResult {
  body: string;
  mutated: boolean;
  sectionExisted: boolean;
}

type ValidationOk = { ok: true; item: string };
type ValidationError = { ok: false; error: string };
export type ValidationResult = ValidationOk | ValidationError;

export function validateJournalItem(input: string): ValidationResult {
  const lines = input.split("\n").map((line) => line.trimEnd());
  const nonBlank = lines.filter((line) => line.trim() !== "");
  if (nonBlank.length === 0) {
    return { ok: false, error: 'journal item must not be empty; expected a "- <text>" list item' };
  }
  if (!/^- \S/.test(nonBlank[0]!)) {
    return {
      ok: false,
      error: `journal item must start with "- <text>"; got: ${JSON.stringify(nonBlank[0]!.slice(0, 40))}`,
    };
  }
  for (const line of nonBlank.slice(1)) {
    if (line.startsWith("#"))
      return {
        ok: false,
        error: "journal item lines must not start with # (would break section structure)",
      };
    if (line.trim() === SHEPHERD_JOURNAL_DETAILS_CLOSE) {
      return { ok: false, error: "journal item must not contain a standalone </details> line" };
    }
  }
  return { ok: true, item: lines.join("\n").trim() };
}

export function appendJournalItem(body: string, item: string): AppendResult {
  const lines = body.replaceAll("\r\n", "\n").split("\n");
  const canonical = findCanonicalJournal(lines);
  const legacy = findLegacyJournal(lines);
  if (canonical && legacy)
    throw new Error(
      "ambiguous Shepherd Journal: both canonical details and legacy ## section exist",
    );
  if (canonical) return appendToCanonical(lines, canonical, item, body);
  if (legacy) return migrateLegacyJournal(lines, legacy, item);
  return createCanonicalJournal(lines, item);
}

type CanonicalJournalBounds = { summaryIdx: number; closeIdx: number };
type LegacyJournalBounds = { headingIdx: number; endIdx: number };

function findCanonicalJournal(lines: string[]): CanonicalJournalBounds | null {
  const journals: CanonicalJournalBounds[] = [];
  let fence: Fence | null = null;
  for (let i = 0; i < lines.length; i++) {
    fence = advanceFence(fence, lines[i]!);
    if (fence || !isJournalLikeSummary(lines[i]!.trimStart())) continue;
    if (lines[i] !== SHEPHERD_JOURNAL_DETAILS_SUMMARY) {
      throw new Error("malformed Shepherd Journal details container: expected exact summary line");
    }
    if (i === 0 || lines[i - 1] !== SHEPHERD_JOURNAL_DETAILS_OPEN) {
      throw new Error(
        "malformed Shepherd Journal details container: summary must immediately follow <details>",
      );
    }
    if (lines[i + 1] !== "") {
      throw new Error(
        "malformed Shepherd Journal details container: expected blank line after summary",
      );
    }
    const closeIdx = findDetailsClose(lines, i + 1);
    journals.push({ summaryIdx: i, closeIdx });
    i = closeIdx;
  }
  if (journals.length > 1) throw new Error("duplicate Shepherd Journal details containers");
  return journals[0] ?? null;
}

function findLegacyJournal(lines: string[]): LegacyJournalBounds | null {
  let fence: Fence | null = null;
  let headingIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    fence = advanceFence(fence, lines[i]!);
    if (fence) continue;
    if (SHEPHERD_JOURNAL_SECTION_PATTERN.test(lines[i]!.trimEnd())) {
      if (headingIdx !== -1) throw new Error("duplicate legacy Shepherd Journal sections");
      headingIdx = i;
    } else if (headingIdx !== -1 && lines[i]!.trim() === SHEPHERD_JOURNAL_DETAILS_CLOSE) {
      throw new Error("unsafe legacy Shepherd Journal section: standalone </details> line");
    } else if (headingIdx !== -1 && /^#{1,2} /.test(lines[i]!)) {
      return { headingIdx, endIdx: i };
    }
  }
  return headingIdx === -1 ? null : { headingIdx, endIdx: lines.length };
}

function appendToCanonical(
  lines: string[],
  bounds: CanonicalJournalBounds,
  item: string,
  originalBody: string,
): AppendResult {
  const journalLines = lines.slice(bounds.summaryIdx + 1, bounds.closeIdx);
  if (itemAlreadyPresent(journalLines, item))
    return { body: originalBody, mutated: false, sectionExisted: true };
  const trimmed = trimTrailingBlankLines(journalLines);
  const content =
    trimmed.length === 0 ? ["", ...item.split("\n")] : [...trimmed, ...item.split("\n")];
  return {
    body: [
      ...lines.slice(0, bounds.summaryIdx + 1),
      ...content,
      ...lines.slice(bounds.closeIdx),
    ].join("\n"),
    mutated: true,
    sectionExisted: true,
  };
}

function migrateLegacyJournal(
  lines: string[],
  bounds: LegacyJournalBounds,
  item: string,
): AppendResult {
  const journalLines = trimBlankLines(lines.slice(bounds.headingIdx + 1, bounds.endIdx));
  const content = itemAlreadyPresent(journalLines, item)
    ? journalLines
    : journalLines.length === 0
      ? ["", ...item.split("\n")]
      : [...journalLines, ...item.split("\n")];
  const canonical = [
    SHEPHERD_JOURNAL_DETAILS_OPEN,
    SHEPHERD_JOURNAL_DETAILS_SUMMARY,
    "",
    ...content,
    SHEPHERD_JOURNAL_DETAILS_CLOSE,
  ];
  const after = lines.slice(bounds.endIdx);
  return {
    body: [
      ...lines.slice(0, bounds.headingIdx),
      ...canonical,
      ...(after.length > 0 ? ["", ...after] : []),
    ].join("\n"),
    mutated: true,
    sectionExisted: true,
  };
}

function createCanonicalJournal(lines: string[], item: string): AppendResult {
  const existing = trimTrailingBlankLines(lines);
  const canonical = [
    SHEPHERD_JOURNAL_DETAILS_OPEN,
    SHEPHERD_JOURNAL_DETAILS_SUMMARY,
    "",
    ...item.split("\n"),
    SHEPHERD_JOURNAL_DETAILS_CLOSE,
  ];
  return {
    body: [...existing, ...(existing.length > 0 ? [""] : []), ...canonical].join("\n"),
    mutated: true,
    sectionExisted: false,
  };
}

function itemAlreadyPresent(journalLines: string[], item: string): boolean {
  const itemLines = item.split("\n").map((line) => line.trimEnd());
  for (let i = 0; i <= journalLines.length - itemLines.length; i++) {
    if (itemLines.every((line, offset) => journalLines[i + offset]!.trimEnd() === line))
      return true;
  }
  return false;
}

function trimTrailingBlankLines(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0 && lines[end - 1]!.trim() === "") end--;
  return lines.slice(0, end);
}

function trimBlankLines(lines: string[]): string[] {
  const first = lines.findIndex((line) => line.trim() !== "");
  return first === -1 ? [] : trimTrailingBlankLines(lines.slice(first));
}
