import { inQuotedHtmlAttribute } from "./markdown-html.mts";
import { isSafeMarkdownInsertionPoint, scanMarkdownLines } from "./markdown-line.mts";
import { structuralDetailsStart } from "./markdown-structure.mts";
const LEGACY = /^ {0,3}##\s+Shepherd\s+Journal\s*$/;
const JOURNAL_SUMMARY = /^<summary>\s*Shepherd\s+Journal\b/i;
const SETEXT = /^ {0,3}(?:=+|-+)[ \t]*$/;
const CLOSE = "</details>";
const OPEN = "<details>";
const SUMMARY = "<summary>Shepherd Journal</summary>";
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
  const expression = closing ? /<\/details>/gi : /<details(?:\s+[^>]*)?>/gi;
  return [...line.matchAll(expression)].filter(
    (match) => !inQuotedHtmlAttribute(line, match.index!),
  ).length;
}
const detailsOpens = (line: string): number => detailsTags(line, false);
const detailsCloses = (line: string): number => detailsTags(line, true);
function close(
  lines: string[],
  syntax: ReturnType<typeof scanMarkdownLines>,
  start: number,
): number | null {
  let depth = 1;
  for (let i = start; i < lines.length; i++) {
    if (syntax[i]!.ignored || syntax[i]!.nested) continue;
    const visible = syntax[i]!.visiblePrefix;
    if (JOURNAL_SUMMARY.test(visible.trimStart()) || LEGACY.test(visible.trimEnd())) return null;
    depth += detailsOpens(visible);
    const closes = detailsCloses(visible);
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
      legacy?.end === lines.length &&
      /^ {0,3}#{1,6}(?:[ \t]+|$)/.test(lines[i]!)
    ) {
      legacy.contentEnd = legacy.end = i;
      continue;
    }
    if (syntax[i]!.ignored || syntax[i]!.nested) continue;
    const visible = syntax[i]!.visiblePrefix;
    detailsDepth += detailsOpens(visible);
    const closes = detailsCloses(visible);
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
    if (LEGACY.test(visible.trimEnd())) {
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
    if (
      legacy &&
      legacy.end === lines.length &&
      SETEXT.test(visible) &&
      i > legacy.contentStart &&
      !syntax[i - 1]!.ignored &&
      !syntax[i - 1]!.nested &&
      lines[i - 1]!.trim() !== ""
    ) {
      legacy.contentEnd = legacy.end = i - 1;
    }
    if (legacy && legacy.end === lines.length && lines[i]!.trim() === CLOSE) return "error";
  }
  return found.length > 1 ? "error" : (found[0] ?? null);
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
function contains(item: string[], body: string[]): boolean {
  const a = item.map((line) => line.trimEnd());
  const b = body.map((line) => line.trimEnd());
  return a.length === b.length && a.every((line, index) => line === b[index]);
}
export function containsJournalEntry(lines: string[], item: string): boolean {
  const target = item.split("\n").map((line) => line.trimEnd());
  return entries(lines).some((entry) => contains(target, entry));
}
function fail(reason: string): ShepherdJournalReconcileResult {
  return {
    error: `${reason}. Supply every live Shepherd Journal entry verbatim, or omit the journal from the supplied body to preserve it automatically.`,
    ok: false,
  };
}
/** Reconciles a candidate body without GitHub I/O, preserving every existing journal entry. */
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
    return {
      body: `${suppliedBody}${suppliedBody === "" ? "" : suppliedBody.endsWith("\n") ? "\n" : "\n\n"}${liveLines
        .slice(live.start, live.end)
        .join("\n")}`,
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
