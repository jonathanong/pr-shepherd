import { parseShepherdJournalEntries, scanShepherdJournal } from "./reconcile.mts";
import { isMarkdownBlockStart, scanMarkdownLines } from "./markdown-line.mts";

/** Result of extracting the single visible structural Shepherd Journal from Markdown. */
export type ShepherdJournalExtraction =
  | { journal: null; ok: true }
  | {
      journal: { entries: string[]; format: "details" | "legacy" };
      ok: true;
    }
  | { error: string; ok: false };

function hasUnrecognizedJournalContent(lines: string[]): boolean {
  const syntax = scanMarkdownLines(lines);
  let foundEntry = false;
  for (const [index, line] of lines.entries()) {
    if (syntax[index]!.visiblePrefix.startsWith("- ")) {
      foundEntry = true;
      continue;
    }
    if (line.trim() === "") continue;
    const indent = line.match(/^ */)![0].length;
    if (!foundEntry || (indent < 2 && !line.startsWith("\t") && isMarkdownBlockStart(line)))
      return true;
  }
  return false;
}

/** Extract ordered journal entries while failing closed on malformed or ambiguous content. */
export function extractShepherdJournal(body: string): ShepherdJournalExtraction {
  const lines = body.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  const journal = scanShepherdJournal(lines);
  if (journal === "error") {
    return {
      error: "malformed, duplicate, or ambiguous Shepherd Journal container",
      ok: false,
    };
  }
  if (!journal) return { journal: null, ok: true };
  const content = lines.slice(journal.contentStart, journal.contentEnd);
  if (hasUnrecognizedJournalContent(content)) {
    return {
      error: "Shepherd Journal content uses an unrecognized entry format",
      ok: false,
    };
  }
  return {
    journal: {
      entries: parseShepherdJournalEntries(content).map((entry) => entry.join("\n")),
      format: journal.format,
    },
    ok: true,
  };
}
