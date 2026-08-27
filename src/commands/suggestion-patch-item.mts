import { relative, resolve } from "node:path";

import { getEffectiveCwd } from "../execution-context.mts";
import { EXIT, ShepherdError } from "../exit-codes.mts";
import { buildPrShepherdCommand } from "../cli/runner.mts";
import { parseSuggestion, isCommittableSuggestion } from "../suggestions/parse.mts";
import { buildUnifiedDiff } from "../suggestions/patch.mts";
import { getUnsafeSuggestionRangeReason } from "../suggestions/range.mts";
import type { ReviewThread, SuggestionPatchResult } from "../types.mts";

export interface SuggestionPatchRequest {
  threadId: string;
  message: string;
  description?: string;
}

export function validateSuggestionThread(
  thread: ReviewThread | null,
  request: SuggestionPatchRequest,
): ReviewThread {
  if (!thread) unavailable(`Thread ${request.threadId} not found on PR.`);
  if (thread.isResolved) unavailable(`Thread ${request.threadId} is already resolved.`);
  if (thread.isOutdated) unavailable(`Thread ${request.threadId} is outdated.`);
  if (thread.isMinimized) unavailable(`Thread ${request.threadId} is minimized.`);
  if (!thread.path || thread.line === null) {
    unavailable(`Thread ${request.threadId} has no file/line anchor.`);
  }
  ensureSafePath(thread.path);
  return thread;
}

export function buildSuggestionPatchItem({
  thread,
  request,
  originalContent,
}: {
  thread: ReviewThread;
  request: SuggestionPatchRequest;
  originalContent: string;
}): SuggestionPatchResult {
  const parsed = parseSuggestion(thread.body);
  if (!parsed)
    unavailable(`Thread ${request.threadId} has no suggestion block in the comment body.`);
  if (!isCommittableSuggestion(parsed)) {
    unavailable(
      `Thread ${request.threadId}'s suggestion body contains nested suggestion fencing or unbalanced ` +
        `3+ backtick fences — refusing to apply (could silently truncate).`,
    );
  }
  const startLine = thread.startLine ?? thread.line!;
  const endLine = thread.line!;
  const unsafeRangeReason = getUnsafeSuggestionRangeReason({
    originalContent,
    startLine,
    endLine,
    replacementLines: parsed.lines,
  });
  if (unsafeRangeReason) {
    const range = startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`;
    unavailable(
      `Thread ${request.threadId}'s suggestion does not safely fit GitHub's anchored range ` +
        `${thread.path}:${range}: ${unsafeRangeReason} Refusing to build a patch; inspect the ` +
        `surrounding source and reviewer intent, then apply the change manually.`,
    );
  }
  const coAuthor = `Co-authored-by: ${thread.author} <${thread.author}@users.noreply.github.com>`;
  return {
    threadId: request.threadId,
    path: thread.path!,
    startLine,
    endLine,
    author: thread.author,
    patch: buildUnifiedDiff({
      path: thread.path!,
      originalContent,
      startLine,
      endLine,
      replacementLines: parsed.lines,
    }),
    commitMessage: request.message,
    commitBody: request.description ? `${request.description}\n\n${coAuthor}` : coAuthor,
    filesToStage: [thread.path!],
  };
}

export function buildSingularInstructions(
  patch: SuggestionPatchResult,
  prNumber: number,
): string[] {
  const range =
    patch.startLine === patch.endLine
      ? `line ${patch.startLine}`
      : `lines ${patch.startLine}–${patch.endLine}`;
  const resolveCommand = buildPrShepherdCommand([
    "apply",
    "review",
    String(prNumber),
    "--resolve-thread-ids",
    patch.threadId,
  ]).text;
  return [
    `Apply the patch to \`${patch.path}\`: run \`git apply\` with the diff shown above, or edit the file directly using the line range (${range}).`,
    `Stage the file: \`git add -- ${quotePath(patch.path)}\``,
    `Commit: \`${buildCommitCommand(patch)}\``,
    `Resolve the thread on GitHub: \`${resolveCommand}\``,
    `Push when ready: \`git push\` (or \`git push --force-with-lease\` after rebasing).`,
  ];
}

export function buildCommitCommand(patch: SuggestionPatchResult): string {
  return [
    "git commit",
    `-m ${shellQuote(patch.commitMessage)}`,
    ...patch.commitBody.split("\n\n").map((part) => `-m ${shellQuote(part)}`),
  ].join(" ");
}

export function quotePath(path: string): string {
  return shellQuote(path);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function ensureSafePath(path: string): void {
  const cwd = getEffectiveCwd();
  const rel = relative(cwd, resolve(cwd, path));
  if (rel.startsWith("..") || rel === "") {
    unavailable(`Thread path escapes the working tree: ${path}.`);
  }
}

function unavailable(message: string): never {
  throw new ShepherdError(message, EXIT.UNAVAILABLE);
}
