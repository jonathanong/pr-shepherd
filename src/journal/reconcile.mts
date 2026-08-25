import { inQuotedHtmlAttribute } from "./markdown-html.mts";
import { isSafeMarkdownInsertionPoint, scanMarkdownLines } from "./markdown-line.mts";
import { setextParagraphStart } from "./markdown-setext.mts";
import { structuralDetailsStart } from "./markdown-structure.mts";
const LEGACY = /^ {0,3}##[ \t]+Shepherd[ \t]+Journal(?:[ \t]+#+)?[ \t]*$/;
const JOURNAL_SUMMARY = /^<summary>\s*Shepherd\s+Journal\b/i;
const SETEXT = /^ {0,3}(?:=+|-+)[ \t]*$/;
const CLOSE = "</details>";
const OPEN = "<details>";
const SUMMARY = "<summary>Shepherd Journal</summary>";
const stripCr = (s: string): string => s.replace(/\r$/, "");
export type ShepherdJournalReconcileResult =
  | { body: string; ok: true }
  | { error: string; ok: false };
export type ShepherdJournalBounds = {
  contentEnd: number;
  contentStart: number;
  end: number;
  format: "details" | "legacy";
  start: number;
};
function detailsTags(line: string, closing: boolean): number {
  if (structuralDetailsStart(line) === null) return 0;
  const expression = closing ? /<\/details>/gi : /<details(?:\s+[^>]*)?\/?>/gi;
  return [...line.matchAll(expression)].filter(
    (match) => !inQuotedHtmlAttribute(line, match.index!),
  ).length;
}
function close(
  lines: string[],
  syntax: ReturnType<typeof scanMarkdownLines>,
  start: number,
): number | null {
  let depth = 1;
  for (let i = start; i < lines.length; i++) {
    if (syntax[i]!.ignored || syntax[i]!.nested) continue;
    const visible = syntax[i]!.visiblePrefix;
    if (JOURNAL_SUMMARY.test(visible.trimStart()) || LEGACY.test(visible)) return null;
    depth += detailsTags(visible, false);
    const closes = detailsTags(visible, true);
    if (closes) {
      depth -= closes;
      if (depth <= 0) return depth === 0 && lines[i] === CLOSE ? i : null;
    }
  }
  return null;
}
export function scanShepherdJournal(lines: string[]): ShepherdJournalBounds | null | "error" {
  const syntax = scanMarkdownLines(lines);
  const found: ShepherdJournalBounds[] = [];
  let detailsDepth = 0;
  let legacy: ShepherdJournalBounds | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (
      !syntax[i]!.ignored &&
      !syntax[i]!.nested &&
      legacy?.end === lines.length &&
      /^ {0,3}#{1,2}(?:[ \t]+|$)/.test(lines[i]!)
    ) {
      if (LEGACY.test(syntax[i]!.visiblePrefix)) return "error";
      legacy.contentEnd = legacy.end = i;
      continue;
    }
    if (syntax[i]!.ignored || syntax[i]!.nested) continue;
    const visible = syntax[i]!.visiblePrefix;
    detailsDepth += detailsTags(visible, false);
    const closes = detailsTags(visible, true);
    if (closes) {
      if (detailsDepth >= closes) {
        detailsDepth -= closes;
        continue;
      }
      return "error";
    }
    if (JOURNAL_SUMMARY.test(visible.trimStart())) {
      if (lines[i] !== SUMMARY || lines[i - 1] !== OPEN || lines[i + 1] !== "") return "error";
      const end = close(lines, syntax, i + 2);
      if (end === null) return "error";
      detailsDepth--;
      found.push({
        contentEnd: end,
        contentStart: i + 2,
        end: end + 1,
        format: "details",
        start: i - 1,
      });
      i = end;
      continue;
    }
    if (LEGACY.test(visible)) {
      if (legacy) return "error";
      legacy = {
        contentEnd: lines.length,
        contentStart: i + 1,
        end: lines.length,
        format: "legacy",
        start: i,
      };
      found.push(legacy);
      continue;
    }
    const start = SETEXT.test(visible) ? setextParagraphStart(lines, syntax, i) : null;
    if (legacy && legacy.end === lines.length && start !== null && start >= legacy.contentStart) {
      legacy.contentEnd = legacy.end = start;
    }
    if (legacy && legacy.end === lines.length && lines[i]!.trim() === CLOSE) return "error";
  }
  return detailsDepth !== 0 || found.length > 1 ? "error" : (found[0] ?? null);
}
function trim(lines: string[]): string[] {
  let a = 0;
  let b = lines.length;
  while (a < b && lines[a]!.trim() === "") a++;
  while (b > a && lines[b - 1]!.trim() === "") b--;
  return lines.slice(a, b);
}
function entries(lines: string[]): string[][] {
  const result: string[][] = [];
  const syntax = scanMarkdownLines(
    lines.map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line)),
  );
  let current: string[] | null = null;
  for (const [index, line] of lines.entries()) {
    if (syntax[index]!.visiblePrefix.startsWith("- ")) {
      if (current) result.push(trim(current));
      current = [line];
    } else if (current) current.push(line);
  }
  if (current) result.push(trim(current));
  return result;
}
function hasUnrecognizedLeadingContent(lines: string[]): boolean {
  const syntax = scanMarkdownLines(
    lines.map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line)),
  );
  const firstEntry = syntax.findIndex((line) => line.visiblePrefix.startsWith("- "));
  if (firstEntry === -1) return lines.some((line) => line.trim() !== "");
  return lines.slice(0, firstEntry).some((line) => line.trim() !== "");
}
function contains(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((s, i) => stripCr(s) === stripCr(b[i]!));
}
export function containsJournalEntry(lines: string[], item: string): boolean {
  const target = item.split("\n");
  return entries(lines).some((entry) => contains(target, entry));
}
function fail(reason: string): ShepherdJournalReconcileResult {
  return {
    error: `${reason}. Supply every live Shepherd Journal entry verbatim, or omit the journal from the supplied body to preserve it automatically.`,
    ok: false,
  };
}
export function reconcileShepherdJournal(
  suppliedBody: string,
  liveBody: string,
): ShepherdJournalReconcileResult {
  const liveLines = liveBody.split("\n");
  const live = scanShepherdJournal(liveBody.replaceAll("\r\n", "\n").split("\n"));
  const suppliedLines = suppliedBody.split("\n");
  const supplied = scanShepherdJournal(suppliedBody.replaceAll("\r\n", "\n").split("\n"));
  if (supplied === "error" || live === "error")
    return fail("malformed, duplicate, or ambiguous Shepherd Journal container");
  if (!live) return { body: suppliedBody, ok: true };
  if (live.format === "details" && supplied?.format === "legacy")
    return fail("canonical Shepherd Journal details container cannot be downgraded to legacy H2");
  const liveContent = trim(liveLines.slice(live.contentStart, live.contentEnd));
  if (!liveContent.length) return { body: suppliedBody, ok: true };
  if (!supplied) {
    if (!isSafeMarkdownInsertionPoint(suppliedBody.replaceAll("\r\n", "\n").split("\n")))
      return fail(
        "supplied body ends inside a Markdown construct that would hide the preserved journal",
      );
    const journal = liveLines.slice(live.start, live.end).join("\n");
    const preservedJournal = journal.endsWith("\r") ? `${journal}\n` : journal;
    return {
      body: `${suppliedBody}${suppliedBody === "" ? "" : suppliedBody.endsWith("\n") ? "\n" : "\n\n"}${preservedJournal}`,
      ok: true,
    };
  }
  const liveEntries = entries(liveLines.slice(live.contentStart, live.contentEnd));
  const liveJournalLines = liveLines.slice(live.contentStart, live.contentEnd);
  if (!liveEntries.length || hasUnrecognizedLeadingContent(liveJournalLines))
    return fail("live Shepherd Journal content uses an unrecognized entry format");
  const target = entries(suppliedLines.slice(supplied.contentStart, supplied.contentEnd));
  for (const entry of liveEntries) {
    const match = target.findIndex((candidate) => contains(entry, candidate));
    if (match === -1)
      return fail(`supplied Shepherd Journal would drop live entry ${JSON.stringify(entry[0])}`);
    target.splice(match, 1);
  }
  return { body: suppliedBody, ok: true };
}
