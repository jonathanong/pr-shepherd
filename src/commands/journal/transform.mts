import {
  SHEPHERD_JOURNAL_SECTION,
  SHEPHERD_JOURNAL_SECTION_PATTERN,
} from "../shepherd-journal.mts";

export interface AppendResult {
  body: string;
  mutated: boolean;
  sectionExisted: boolean;
}

type ValidationOk = { ok: true; item: string };
type ValidationError = { ok: false; error: string };
export type ValidationResult = ValidationOk | ValidationError;

/** Validates that the input is a properly formed markdown list item. */
export function validateJournalItem(input: string): ValidationResult {
  const lines = input.split("\n").map((l) => l.trimEnd());
  const nonBlank = lines.filter((l) => l.trim() !== "");

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
    if (line.startsWith("#")) {
      return {
        ok: false,
        error: "journal item lines must not start with # (would break section structure)",
      };
    }
  }

  const trimmed = lines
    .map((l) => l.trimEnd())
    .join("\n")
    .trim();
  return { ok: true, item: trimmed };
}

/**
 * Appends a validated list item to the ## Shepherd Journal section of a PR body.
 * Creates the section at the end if absent. Skips if the exact item is already present (idempotent).
 */
export function appendJournalItem(body: string, item: string): AppendResult {
  const lines = body.split("\n");
  const bounds = findSectionBounds(lines);

  if (!bounds) {
    return createSection(lines, item);
  }

  const { headingIdx, endIdx } = bounds;
  const sectionLines = lines.slice(headingIdx + 1, endIdx);

  if (itemAlreadyPresent(sectionLines, item)) {
    return { body, mutated: false, sectionExisted: true };
  }

  return appendToSection(lines, headingIdx, endIdx, sectionLines, item);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface SectionBounds {
  headingIdx: number;
  endIdx: number;
}

function findSectionBounds(lines: string[]): SectionBounds | null {
  let inFence = false;
  let headingIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();

    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inFence = !inFence;
      continue;
    }

    if (!inFence) {
      if (headingIdx === -1) {
        if (SHEPHERD_JOURNAL_SECTION_PATTERN.test(lines[i]!.trimEnd())) {
          headingIdx = i;
        }
      } else if (/^#{1,2} /.test(lines[i]!)) {
        return { headingIdx, endIdx: i };
      }
    }
  }

  if (headingIdx === -1) return null;
  return { headingIdx, endIdx: lines.length };
}

function itemAlreadyPresent(sectionLines: string[], item: string): boolean {
  const itemLines = item.split("\n").map((l) => l.trimEnd());
  const normalizedSection = sectionLines.map((l) => l.trimEnd());

  for (let i = 0; i <= normalizedSection.length - itemLines.length; i++) {
    let match = true;
    for (let j = 0; j < itemLines.length; j++) {
      if (normalizedSection[i + j] !== itemLines[j]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

function appendToSection(
  lines: string[],
  headingIdx: number,
  endIdx: number,
  sectionLines: string[],
  item: string,
): AppendResult {
  const before = lines.slice(0, headingIdx + 1);
  const after = lines.slice(endIdx);

  // Strip trailing blank lines from section body.
  let sectionEnd = sectionLines.length;
  while (sectionEnd > 0 && sectionLines[sectionEnd - 1]!.trim() === "") {
    sectionEnd--;
  }
  const trimmedSection = sectionLines.slice(0, sectionEnd);

  // Insert blank line after heading when section was empty, then the item.
  const newSection =
    trimmedSection.length === 0
      ? ["", ...item.split("\n")]
      : [...trimmedSection, ...item.split("\n")];

  // One blank line before the next section (or trailing newline at EOF).
  const newBody = [...before, ...newSection, ...(after.length > 0 ? ["", ...after] : [])].join(
    "\n",
  );

  return { body: newBody, mutated: true, sectionExisted: true };
}

function createSection(lines: string[], item: string): AppendResult {
  // Strip trailing blank lines from the existing body.
  let end = lines.length;
  while (end > 0 && lines[end - 1]!.trim() === "") {
    end--;
  }
  const trimmedLines = lines.slice(0, end);

  const newBody = [...trimmedLines, "", SHEPHERD_JOURNAL_SECTION, "", ...item.split("\n")].join(
    "\n",
  );

  return { body: newBody, mutated: true, sectionExisted: false };
}
