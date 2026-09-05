const HEAD_FRACTION = 0.7;

export const BODY_TRUNCATE_MAX_CHARS = 1200;
export const NESTED_BODY_TRUNCATE_MAX_CHARS = 600;

function fenceStatesAfterEachLine(lines: string[]): boolean[] {
  const states: boolean[] = [];
  let inFence = false;
  let fenceLen = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (inFence) {
      if (/^`+$/.test(trimmed) && trimmed.length >= fenceLen) {
        inFence = false;
        fenceLen = 0;
      }
    } else {
      const opener = /^(`{3,})/.exec(trimmed);
      if (opener) {
        inFence = true;
        fenceLen = opener[1].length;
      }
    }
    states.push(inFence);
  }
  return states;
}

function cumulativeLengths(lines: string[]): number[] {
  const out: number[] = [];
  let total = 0;
  for (const line of lines) {
    total += line.length + 1;
    out.push(total);
  }
  return out;
}

/** Last line index keepable within `budget`, extended forward past any fence still open at that point. */
function findHeadEnd(states: boolean[], cumLens: number[], budget: number): number {
  let end = -1;
  for (let i = 0; i < cumLens.length; i++) {
    if (cumLens[i]! > budget) break;
    end = i;
  }
  while (end >= 0 && end < states.length - 1 && states[end]) end++;
  return end;
}

/** First line index keepable within `budget` counted from the end, extended backward past any fence open entering it. */
function findTailStart(states: boolean[], cumLens: number[], budget: number): number {
  const n = cumLens.length;
  const total = cumLens[n - 1] ?? 0;
  let start = n;
  for (let j = n - 1; j >= 0; j--) {
    const suffixLen = total - (j > 0 ? cumLens[j - 1]! : 0);
    if (suffixLen > budget) break;
    start = j;
  }
  while (start > 0 && states[start - 1]) start--;
  return start;
}

function elisionMarker(lineCount: number, url?: string): string {
  return url ? `[…${lineCount} lines elided — full text: ${url}]` : `[…${lineCount} lines elided]`;
}

/**
 * Truncates `body` to roughly `maxChars`, keeping a head and tail portion so an
 * opening question and a trailing summary both survive. Never cuts inside a
 * ``` fence: the cut points snap outward to the nearest fence-safe line
 * boundary, and truncation is skipped entirely when no safe boundary exists
 * (e.g. a single unterminated fence spanning the whole body) — an unbalanced
 * fence here would swallow every section rendered after it in the same tick.
 */
export function truncateBody(body: string, maxChars: number, url?: string): string {
  if (body.length <= maxChars) return body;
  const lines = body.split("\n");
  const states = fenceStatesAfterEachLine(lines);
  const cumLens = cumulativeLengths(lines);
  const headBudget = Math.ceil(maxChars * HEAD_FRACTION);
  const tailBudget = maxChars - headBudget;

  const headEnd = findHeadEnd(states, cumLens, headBudget);
  const tailStart = findTailStart(states, cumLens, tailBudget);
  if (tailStart <= headEnd + 1) return body;

  const head = lines.slice(0, headEnd + 1).join("\n");
  const tail = lines.slice(tailStart).join("\n");
  const marker = elisionMarker(tailStart - (headEnd + 1), url);
  return [head, marker, tail].join("\n\n");
}
