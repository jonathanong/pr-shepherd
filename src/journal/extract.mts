import {
  hasUnrecognizedLeadingJournalContent,
  parseShepherdJournalEntries,
  scanShepherdJournal,
} from "./reconcile.mts";

export type ShepherdJournalExtraction =
  | { journal: null; ok: true }
  | {
      journal: { entries: string[]; format: "details" | "legacy" };
      ok: true;
    }
  | { error: string; ok: false };

export function extractShepherdJournal(body: string): ShepherdJournalExtraction {
  const lines = body.replaceAll("\r\n", "\n").split("\n");
  const journal = scanShepherdJournal(lines);
  if (journal === "error") {
    return {
      error: "malformed, duplicate, or ambiguous Shepherd Journal container",
      ok: false,
    };
  }
  if (!journal) return { journal: null, ok: true };
  const content = lines.slice(journal.contentStart, journal.contentEnd);
  if (hasUnrecognizedLeadingJournalContent(content)) {
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
