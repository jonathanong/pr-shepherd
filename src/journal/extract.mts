import { parseShepherdJournalEntries, scanShepherdJournal } from "./reconcile.mts";
import { isMarkdownBlockStart, scanMarkdownLines } from "./markdown-line.mts";
import { stripMarkdownContainer } from "./markdown-container.mts";
import { isIndentedCode } from "./markdown-structure.mts";

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
  let lazyContinuation = false;
  let nestedBlock = false;
  for (const [index, line] of lines.entries()) {
    const scanned = syntax[index]!;
    if (scanned.visiblePrefix.startsWith("- ") && /^- \S/.test(line)) {
      foundEntry = true;
      lazyContinuation = true;
      nestedBlock = false;
      continue;
    }
    if (line.trim() === "") {
      if (foundEntry) lazyContinuation = false;
      continue;
    }
    if (!foundEntry) return true;
    const content = stripMarkdownContainer(line, [{ kind: "list", width: 2 }]);
    if (content === null) {
      if (!lazyContinuation || isMarkdownBlockStart(line)) return true;
      continue;
    }
    if (scanned.ignored || isMarkdownBlockStart(content) || isIndentedCode(content)) {
      lazyContinuation = false;
      nestedBlock = true;
      continue;
    }
    if (nestedBlock && /^[ \t]/.test(content)) {
      lazyContinuation = false;
      continue;
    }
    lazyContinuation = true;
    nestedBlock = false;
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
