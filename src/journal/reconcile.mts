import { scanMarkdownLines } from "./markdown-line.mts";
import { structuralDetailsStart } from "./markdown-structure.mts";

const LEGACY = /^##\s+Shepherd\s+Journal\s*$/;
const JOURNAL_SUMMARY = /^<summary>\s*Shepherd\s+Journal\b/i;
const CLOSE = "</details>";
const OPEN = "<details>";
const SUMMARY = "<summary>Shepherd Journal</summary>";

export type ShepherdJournalReconcileResult =
  | { body: string; ok: true }
  | { error: string; ok: false };

type Bounds = {
  contentEnd: number;
  contentStart: number;
  end: number;
  format: "details" | "legacy";
  start: number;
};

const detailsOpens = (line: string): number =>
  structuralDetailsStart(line) !== null ? (line.match(/<details(?:\s+[^>]*)?>/gi) ?? []).length : 0;
const detailsCloses = (line: string): number =>
  structuralDetailsStart(line) !== null ? (line.match(/<\/details>/gi) ?? []).length : 0;

function close(
  lines: string[],
  syntax: ReturnType<typeof scanMarkdownLines>,
  start: number,
): number | null {
  let depth = 1;
  for (let i = start; i < lines.length; i++) {
    if (syntax[i]!.ignored) continue;
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

function scan(lines: string[]): Bounds | null | "error" {
  const syntax = scanMarkdownLines(lines);
  const found: Bounds[] = [];
  let detailsDepth = 0;
  let legacy: Bounds | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (syntax[i]!.ignored) continue;
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
    if (legacy && legacy.end === lines.length && /^#{1,2} /.test(visible)) {
      legacy.contentEnd = i;
      legacy.end = i;
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

function contains(item: string[], body: string[]): boolean {
  const a = item.map((line) => line.trimEnd());
  const b = body.map((line) => line.trimEnd());
  return a.length === b.length && a.every((line, index) => line === b[index]);
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
  const live = scan(liveBody.replaceAll("\r\n", "\n").split("\n"));
  const suppliedLines = suppliedBody.split("\n");
  const supplied = scan(suppliedBody.replaceAll("\r\n", "\n").split("\n"));
  if (supplied === "error" || live === "error")
    return fail("malformed, duplicate, or ambiguous Shepherd Journal container");
  if (!live) return { body: suppliedBody, ok: true };
  if (live.format === "details" && supplied?.format === "legacy")
    return fail("canonical Shepherd Journal details container cannot be downgraded to legacy H2");
  const liveEntries = entries(liveLines.slice(live.contentStart, live.contentEnd));
  if (!liveEntries.length) return { body: suppliedBody, ok: true };
  if (!supplied)
    return {
      body: [...trim(suppliedLines), "", ...trim(liveLines.slice(live.start, live.end))].join("\n"),
      ok: true,
    };
  const target = entries(suppliedLines.slice(supplied.contentStart, supplied.contentEnd));
  for (const entry of liveEntries) {
    const match = target.findIndex((candidate) => contains(entry, candidate));
    if (match === -1)
      return fail(`supplied Shepherd Journal would drop live entry ${JSON.stringify(entry[0])}`);
    target.splice(match, 1);
  }
  return { body: suppliedBody, ok: true };
}
