import { validateJournalItem } from "../commands/journal/journal-item.mts";
import { scanShepherdJournal } from "./reconcile.mts";

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
  const lines = body.replaceAll("\r\n", "\n").split("\n");
  const bounds = scanShepherdJournal(lines);
  if (bounds === "error")
    throw new Error("malformed, duplicate, or ambiguous Shepherd Journal container");
  if (!bounds) return create(lines, item);
  const content = lines.slice(bounds.contentStart, bounds.contentEnd);
  if (bounds.format === "details" && contains(content, item))
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
    ...(contains(content, item) ? [] : item.split("\n")),
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

function contains(lines: string[], item: string): boolean {
  const target = item.split("\n").map((line) => line.trimEnd());
  return lines.some((_, index) =>
    target.every((line, offset) => lines[index + offset]?.trimEnd() === line),
  );
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
