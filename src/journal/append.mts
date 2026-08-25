import { validateJournalItem } from "../commands/journal/journal-item.mts";
import { containsJournalEntry, scanShepherdJournal } from "./reconcile.mts";
import { isSafeMarkdownInsertionPoint } from "./markdown-line.mts";

const OPEN = "<details>";
const SUMMARY = "<summary>Shepherd Journal</summary>";
const CLOSE = "</details>";

export { validateJournalItem };

export interface AppendResult {
  body: string;
  mutated: boolean;
  sectionExisted: boolean;
}

export function appendJournalItem(body: string, item: string): AppendResult {
  const validated = validateJournalItem(item);
  if (!validated.ok) throw new Error(validated.error);
  if (
    validated.item
      .split("\n")
      .slice(1)
      .some((line) => /^(?:[-+*]|\d{1,9}[.)])[ \t]+/.test(line))
  )
    throw new Error("journal item must contain exactly one top-level list item");
  item = validated.item;
  const lines = body.replaceAll("\r\n", "\n").split("\n");
  const bounds = scanShepherdJournal(lines);
  if (bounds === "error")
    throw new Error("malformed, duplicate, or ambiguous Shepherd Journal container");
  if (!bounds) {
    if (!isSafeMarkdownInsertionPoint(lines))
      throw new Error("cannot append Shepherd Journal inside an unterminated Markdown construct");
    return create(lines, item);
  }
  const content = lines.slice(bounds.contentStart, bounds.contentEnd);
  if (bounds.format === "details" && containsJournalEntry(content, item))
    return { body, mutated: false, sectionExisted: true };
  const next = [...trimEnd(content), ...item.split("\n")];
  if (bounds.format === "details") {
    return {
      body: [
        ...lines.slice(0, bounds.contentStart),
        ...next,
        ...lines.slice(bounds.contentEnd),
      ].join("\n"),
      mutated: true,
      sectionExisted: true,
    };
  }
  const legacyContent = trim(content);
  const canonical = [
    OPEN,
    SUMMARY,
    "",
    ...legacyContent,
    ...(containsJournalEntry(content, item) ? [] : item.split("\n")),
    CLOSE,
  ];
  const suffix = lines.slice(bounds.end);
  return {
    body: [
      ...lines.slice(0, bounds.start),
      ...canonical,
      ...(suffix[0]?.trim() ? [""] : []),
      ...suffix,
    ].join("\n"),
    mutated: true,
    sectionExisted: true,
  };
}

function create(lines: string[], item: string): AppendResult {
  const existing = trimEnd(lines);
  return {
    body: [
      ...existing,
      ...(existing.length ? [""] : []),
      OPEN,
      SUMMARY,
      "",
      ...item.split("\n"),
      CLOSE,
    ].join("\n"),
    mutated: true,
    sectionExisted: false,
  };
}

function trimEnd(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0 && lines[end - 1]!.trim() === "") end--;
  return lines.slice(0, end);
}

function trim(lines: string[]): string[] {
  const start = lines.findIndex((line) => line.trim() !== "");
  return start === -1 ? [] : trimEnd(lines.slice(start));
}
