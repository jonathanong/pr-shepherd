const HEAD_FRACTION = 0.7;

export const BODY_TRUNCATE_MAX_CHARS = 1200;
export const NESTED_BODY_TRUNCATE_MAX_CHARS = 600;

interface FenceOpener {
  char: string;
  len: number;
}

function fenceOpener(trimmed: string): FenceOpener | null {
  const char = trimmed[0];
  if (char !== "`" && char !== "~") return null;
  let len = 0;
  while (trimmed[len] === char) len++;
  return len >= 3 ? { char, len } : null;
}

function isFenceCloser(trimmed: string, fence: FenceOpener): boolean {
  return trimmed.length >= fence.len && [...trimmed].every((c) => c === fence.char);
}

// Backtick and tilde fences close only against their own kind — a run of one
// character never closes a fence opened with the other (CommonMark semantics).
function fenceStatesAfterEachLine(lines: string[]): boolean[] {
  const states: boolean[] = [];
  let fence: FenceOpener | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (fence) {
      if (isFenceCloser(trimmed, fence)) fence = null;
    } else {
      fence = fenceOpener(trimmed);
    }
    states.push(fence !== null);
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

const REVIEW_COMMENT_URL_RE =
  /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/\d+#discussion_r(\d+)$/;
const ISSUE_COMMENT_URL_RE =
  /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:pull|issues)\/\d+#issuecomment-(\d+)$/;

// An agent can run this directly — no browser round-trip — to read the full body.
function commentViewCommand(url: string): string | undefined {
  const review = REVIEW_COMMENT_URL_RE.exec(url);
  if (review) {
    const [, owner, repo, id] = review;
    return `gh api repos/${owner}/${repo}/pulls/comments/${id}`;
  }
  const issue = ISSUE_COMMENT_URL_RE.exec(url);
  if (issue) {
    const [, owner, repo, id] = issue;
    return `gh api repos/${owner}/${repo}/issues/comments/${id}`;
  }
  return undefined;
}

function elisionMarker(charCount: number, url?: string): string {
  const pointer = url ? (commentViewCommand(url) ?? url) : undefined;
  return pointer
    ? `[…${charCount} chars elided — full text: ${pointer}]`
    : `[…${charCount} chars elided]`;
}

/**
 * Truncates `body` to roughly `maxChars`, keeping a head and tail portion so an
 * opening question and a trailing summary both survive. Never cuts inside a
 * ``` or ~~~ fence: the cut points snap outward to the nearest fence-safe line
 * boundary — an unbalanced fence here would swallow every section rendered
 * after it in the same tick. A single line too long to fit a budget on its own
 * (headEnd stays -1, or no line fits from the tail) falls back to a
 * character-level slice of that line rather than dropping it entirely.
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

  const head =
    headEnd >= 0 ? lines.slice(0, headEnd + 1).join("\n") : lines[0]!.slice(0, headBudget);
  const tail =
    tailStart < lines.length
      ? lines.slice(tailStart).join("\n")
      : tailBudget > 0
        ? lines[lines.length - 1]!.slice(-tailBudget)
        : "";

  const elidedChars = body.length - head.length - tail.length;
  if (elidedChars <= 0) return body;
  return [head, elisionMarker(elidedChars, url), tail].join("\n\n");
}
