/**
 * Build a git-apply-compatible unified diff for a single suggestion hunk.
 *
 * The diff uses `--- a/<path>` / `+++ b/<path>` headers so `git apply` and
 * `git apply --check` accept it without a `diff --git` preamble.
 */

/**
 * Strip leading/trailing replacement lines that are identical to the adjacent
 * file lines just outside the removed range.
 *
 * GitHub stores a suggestion as a verbatim replacement for the *highlighted*
 * line range, but reviewers often paste surrounding context into the box. Those
 * context-duplicating lines must not appear as additions in the diff — they
 * belong to the surrounding unchanged file content. Stripping them here produces
 * a minimal diff that applies cleanly without duplicating lines.
 *
 * Comparison normalises trailing `\r` from file lines so CRLF files (which
 * carry `\r` on each entry after `split("\n")`) still match suggestion lines
 * delivered as LF-only by the GitHub API.
 */
function trimReplacementToContext(
  fileLines: readonly string[],
  startLine: number,
  endLine: number,
  replacementLines: readonly string[],
): readonly string[] {
  const norm = (s: string) => (s.endsWith("\r") ? s.slice(0, -1) : s);

  // Leading trim: largest L where replacement[0..L) == fileLines[startLine-1-L..startLine-1)
  const maxL = Math.min(startLine - 1, replacementLines.length);
  let L = 0;
  leading: for (let l = maxL; l >= 1; l--) {
    for (let i = 0; i < l; i++) {
      if (norm(replacementLines[i]!) !== norm(fileLines[startLine - 1 - l + i]!)) continue leading;
    }
    L = l;
    break;
  }

  const remainder = replacementLines.slice(L);

  // Trailing trim: largest T where remainder[len-T..len) == fileLines[endLine..endLine+T)
  const maxT = Math.min(fileLines.length - endLine, remainder.length);
  let T = 0;
  trailing: for (let t = maxT; t >= 1; t--) {
    for (let j = 0; j < t; j++) {
      if (norm(remainder[remainder.length - t + j]!) !== norm(fileLines[endLine + j]!))
        continue trailing;
    }
    T = t;
    break;
  }

  if (L === 0 && T === 0) return replacementLines;
  return T === 0 ? remainder : remainder.slice(0, remainder.length - T);
}

export function buildUnifiedDiff({
  path,
  originalContent,
  startLine,
  endLine,
  replacementLines,
  context = 3,
}: {
  path: string;
  originalContent: string;
  startLine: number;
  endLine: number;
  replacementLines: readonly string[];
  context?: number;
}): string {
  const endsWithNewline = originalContent.endsWith("\n");
  const body = endsWithNewline ? originalContent.slice(0, -1) : originalContent;
  const fileLines = body === "" ? [] : body.split("\n");

  const removedLines = fileLines.slice(startLine - 1, endLine);

  const beforeStart = Math.max(0, startLine - 1 - context);
  const beforeLines = fileLines.slice(beforeStart, startLine - 1);
  const afterEnd = Math.min(fileLines.length, endLine + context);
  const afterLines = fileLines.slice(endLine, afterEnd);

  // Trim replacement lines that duplicate adjacent file context so the diff is
  // minimal and `git apply`-clean (issue #294).
  const replacement = trimReplacementToContext(fileLines, startLine, endLine, replacementLines);

  const hunkOrigStart = beforeStart + 1;
  const hunkOrigCount = beforeLines.length + removedLines.length + afterLines.length;
  const hunkNewCount = beforeLines.length + replacement.length + afterLines.length;

  const noNewline = "\\ No newline at end of file\n";
  const isLastOrigLine = (lineIdx: number) => !endsWithNewline && lineIdx === fileLines.length - 1;

  const out: string[] = [
    `--- a/${path}\n`,
    `+++ b/${path}\n`,
    `@@ -${hunkOrigStart},${hunkOrigCount} +${hunkOrigStart},${hunkNewCount} @@\n`,
  ];

  for (let i = 0; i < beforeLines.length; i++) {
    out.push(` ${beforeLines[i]}\n`);
    if (isLastOrigLine(beforeStart + i)) out.push(noNewline);
  }

  for (let i = 0; i < removedLines.length; i++) {
    out.push(`-${removedLines[i]}\n`);
    if (isLastOrigLine(startLine - 1 + i)) out.push(noNewline);
  }

  // Replacement ends the file only when the removed range reaches the very last line —
  // not just because context is 0 (there may still be unshown lines beyond the hunk).
  const addedEndsFile = !endsWithNewline && endLine >= fileLines.length;
  const hasCr = originalContent.includes("\r\n");
  for (let i = 0; i < replacement.length; i++) {
    const line = hasCr ? replacement[i] + "\r" : replacement[i];
    out.push(`+${line}\n`);
    if (addedEndsFile && i === replacement.length - 1) out.push(noNewline);
  }

  for (let i = 0; i < afterLines.length; i++) {
    out.push(` ${afterLines[i]}\n`);
    if (isLastOrigLine(endLine + i)) out.push(noNewline);
  }

  return out.join("");
}
