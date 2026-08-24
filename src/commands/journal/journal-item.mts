import { isJournalLikeSummary, isReservedJournalMarker } from "./journal-markdown.mts";

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
    if (line.startsWith("#")) {
      return {
        ok: false,
        error: "journal item lines must not start with # (would break section structure)",
      };
    }
    if (isReservedJournalMarker(line.trim()) || isJournalLikeSummary(line.trim())) {
      return {
        ok: false,
        error: `journal item must not contain standalone journal container marker ${JSON.stringify(line.trim())}`,
      };
    }
  }
  return { ok: true, item: lines.join("\n").trim() };
}
