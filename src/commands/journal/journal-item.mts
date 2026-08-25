import { scanMarkdownLines } from "../../journal/markdown-line.mts";

type ValidationOk = { ok: true; item: string };
type ValidationError = { ok: false; error: string };
export type ValidationResult = ValidationOk | ValidationError;

const RESERVED_CONTAINER_TAG = /<\/?details(?:\s+[^>]*)?>|<summary\s*Shepherd\s+Journal\b[^>]*>/i;

function reservedContainerTag(lines: string[]): string | null {
  const syntax = scanMarkdownLines(lines);
  for (const [index] of lines.entries()) {
    const match = RESERVED_CONTAINER_TAG.exec(syntax[index]!.visiblePrefix);
    if (match) return match[0];
  }
  return null;
}

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
  const marker = reservedContainerTag(lines);
  if (marker) {
    return {
      ok: false,
      error: `journal item must not contain journal container marker ${JSON.stringify(marker)}`,
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
  return { ok: true, item: lines.join("\n").trim() };
}
