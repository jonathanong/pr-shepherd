import { loadConfig } from "../config/load.mts";

const LOG_EXCERPT_CONTEXT_LINES = 16;
const LOG_EXCERPT_TAIL_LINES = 28;
const LOG_EXCERPT_MAX_CHARS = 4_000;
const TRUNCATED_MARK = "[truncated]";
const ANSI_SGR_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
const STEP_GROUP_RE = /^##\[group\](?:Run |Post )/;
const GROUP_RE = /^##\[group\]/;
const ENDGROUP_RE = /^##\[endgroup\]$/;
const POST_JOB_RE = /^(?:Post job cleanup\.?|Cleaning up orphan processes)$/;

export function buildLogExcerpt(raw: string): string | undefined {
  const ignorePatterns = compileIgnoreLogLinePatterns();
  const prepared = raw
    .split(/\r?\n/)
    .map(cleanLogLine)
    .filter((line) => line.trim() !== "");
  if (prepared.length === 0) return undefined;

  const isolated = isolateFailedStep(prepared);
  const lines = isolated.lines
    .map(stripGroupMarkers)
    .filter((line) => line.trim() !== "" && !isNoiseLine(line, ignorePatterns));
  if (lines.length === 0) return undefined;

  const aggregateExcerpt = buildAggregateJobResultsExcerpt(lines);
  if (aggregateExcerpt !== undefined) return aggregateExcerpt;
  if (isolated.isolated) {
    const errorIndex = findLogExcerptAnchor(lines);
    return truncateTail(lines.join("\n"), errorIndex === -1 ? undefined : lines[errorIndex]);
  }
  return boundFallbackExcerpt(lines);
}

function isolateFailedStep(lines: string[]): { lines: string[]; isolated: boolean } {
  const postJob = lines.findIndex((line) => POST_JOB_RE.test(line));
  const capped = postJob === -1 ? lines : lines.slice(0, postJob);
  const anchor = findLogExcerptAnchor(capped);
  const groupStart = findPrecedingStepGroup(capped, anchor === -1 ? capped.length - 1 : anchor);
  if (groupStart === -1) return { lines: capped, isolated: false };

  const endgroup = findMatchingEndgroup(capped, groupStart);
  const after = endgroup === -1 ? groupStart + 1 : endgroup + 1;
  const next = findNextStepGroup(capped, after);
  return { lines: capped.slice(after, next === -1 ? capped.length : next), isolated: true };
}

function findPrecedingStepGroup(lines: string[], from: number): number {
  for (let i = Math.min(from, lines.length - 1); i >= 0; i--) {
    if (STEP_GROUP_RE.test(lines[i] ?? "")) return i;
  }
  return -1;
}

function findMatchingEndgroup(lines: string[], groupStart: number): number {
  let depth = 0;
  for (let i = groupStart; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (GROUP_RE.test(line)) depth++;
    else if (ENDGROUP_RE.test(line) && --depth === 0) return i;
  }
  return -1;
}

function findNextStepGroup(lines: string[], from: number): number {
  let depth = 0;
  for (let i = from; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (GROUP_RE.test(line)) {
      if (depth === 0 && STEP_GROUP_RE.test(line)) return i;
      depth++;
    } else if (ENDGROUP_RE.test(line) && depth > 0) depth--;
  }
  return -1;
}

function boundFallbackExcerpt(lines: string[]): string | undefined {
  const errorIndex = findLogExcerptAnchor(lines);
  if (errorIndex === -1) {
    return truncateLogExcerpt(lines.slice(-LOG_EXCERPT_TAIL_LINES).join("\n"));
  }
  const start = Math.max(0, errorIndex - LOG_EXCERPT_CONTEXT_LINES);
  const excerpt = lines.slice(
    start,
    Math.min(lines.length, errorIndex + LOG_EXCERPT_CONTEXT_LINES + 1),
  );
  return truncateAnchoredExcerpt(excerpt, errorIndex - start);
}

function findLogExcerptAnchor(lines: string[]): number {
  const explicitError = lines.findIndex((line) => line.includes("##[error]"));
  if (explicitError !== -1) return explicitError;
  return lines.findIndex((line) => /\b(error|failed|cancelled)\b/i.test(line));
}

function buildAggregateJobResultsExcerpt(lines: string[]): string | undefined {
  const jobResults = extractJobResults(lines);
  if (jobResults === undefined) return undefined;
  const failed = Object.entries(jobResults)
    .map(([name, value]) => ({ name, result: extractJobResult(value) }))
    .filter(
      (entry) => entry.result !== undefined && !["success", "skipped"].includes(entry.result),
    );
  if (failed.length === 0) return undefined;

  return truncateLogExcerpt(
    [
      ...lines.filter((line) => /required jobs failed|exit code \d+/i.test(line)),
      "Job results (non-success):",
      ...failed.map((entry) => `${entry.name}: ${entry.result}`),
    ].join("\n"),
  );
}

function extractJobResults(lines: string[]): Record<string, unknown> | undefined {
  const startIndex = lines.findIndex((line) => line.includes("Job results:"));
  if (startIndex === -1) return undefined;
  const block = collectJsonBlock(lines, startIndex);
  if (block === undefined) return undefined;
  try {
    const parsed = JSON.parse(block) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function collectJsonBlock(lines: string[], startIndex: number): string | undefined {
  const startLine = lines[startIndex] ?? "";
  const objectStart = startLine.indexOf("{");
  if (objectStart === -1) return undefined;
  const collected = [startLine.slice(objectStart)];
  let depth = braceDepth(collected[0]);
  for (let i = startIndex + 1; i < lines.length && depth > 0; i++) {
    const line = lines[i] ?? "";
    collected.push(line);
    depth += braceDepth(line);
  }
  return depth === 0 ? collected.join("\n") : undefined;
}

function braceDepth(line: string): number {
  return [...line].reduce((depth, ch) => {
    if (ch === "{") return depth + 1;
    if (ch === "}") return depth - 1;
    return depth;
  }, 0);
}

function extractJobResult(value: unknown): string | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const result = (value as { result?: unknown }).result;
  return typeof result === "string" ? result : undefined;
}

function truncateLogExcerpt(text: string): string {
  if (text.length <= LOG_EXCERPT_MAX_CHARS) return text;
  return `${text.slice(0, LOG_EXCERPT_MAX_CHARS - `\n${TRUNCATED_MARK}`.length).trimEnd()}\n${TRUNCATED_MARK}`;
}

function truncateAnchoredExcerpt(lines: string[], anchorIndex: number): string {
  const text = lines.join("\n");
  if (text.length <= LOG_EXCERPT_MAX_CHARS) return text;
  return truncateLogExcerpt(`${TRUNCATED_MARK}\n${lines.slice(anchorIndex).join("\n")}`);
}

function truncateTail(text: string, keep?: string): string {
  if (text.length <= LOG_EXCERPT_MAX_CHARS) return text;
  const head = `${TRUNCATED_MARK}\n`;
  const slice = text.slice(-(LOG_EXCERPT_MAX_CHARS - head.length));
  const nl = slice.indexOf("\n");
  const tail = `${head}${nl === -1 ? slice : slice.slice(nl + 1)}`;
  if (!keep || tail.includes(keep)) return tail;
  const from = text.lastIndexOf(keep);
  return from === -1 ? tail : truncateLogExcerpt(`${head}${text.slice(from)}`);
}

function compileIgnoreLogLinePatterns(): RegExp[] {
  return loadConfig().checks.ignoreLogLines.map((pattern) => new RegExp(pattern));
}

function isNoiseLine(line: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(line));
}

function cleanLogLine(line: string): string {
  return line
    .replace(/^\uFEFF/, "")
    .replace(ANSI_SGR_RE, "")
    .replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s*/, "")
    .trimEnd();
}

function stripGroupMarkers(line: string): string {
  return line.replace(/##\[(?:group|endgroup)\]/g, "");
}
