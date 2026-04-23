/**
 * Build a git-apply-compatible unified diff for a single suggestion hunk.
 *
 * The diff uses `--- a/<path>` / `+++ b/<path>` headers so `git apply` and
 * `git apply --check` accept it without a `diff --git` preamble.
 */

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

  const hunkOrigStart = beforeStart + 1;
  const hunkOrigCount = beforeLines.length + removedLines.length + afterLines.length;
  const hunkNewCount = beforeLines.length + replacementLines.length + afterLines.length;

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
  for (let i = 0; i < replacementLines.length; i++) {
    const line = hasCr ? replacementLines[i] + "\r" : replacementLines[i];
    out.push(`+${line}\n`);
    if (addedEndsFile && i === replacementLines.length - 1) out.push(noNewline);
  }

  for (let i = 0; i < afterLines.length; i++) {
    out.push(` ${afterLines[i]}\n`);
    if (isLastOrigLine(endLine + i)) out.push(noNewline);
  }

  return out.join("");
}
