import { execFile as execFileCb } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

import { getRepoInfo, getCurrentPrNumber, getCurrentBranch } from "../github/client.mts";
import { fetchPrBatch } from "../github/batch.mts";
import { parseSuggestion, isCommittableSuggestion } from "../suggestions/parse.mts";
import { buildUnifiedDiff } from "../suggestions/patch.mts";
import { EXIT, ShepherdError } from "../exit-codes.mts";
import type { CommitSuggestionResult, GlobalOptions } from "../types.mts";
import { buildPrShepherdCommand } from "../cli/runner.mts";

const execFile = promisify(execFileCb);

interface CommitSuggestionOptions extends GlobalOptions {
  threadId: string;
  message: string;
  description?: string;
}

export async function runCommitSuggestion(
  opts: CommitSuggestionOptions,
): Promise<CommitSuggestionResult> {
  if (!opts.threadId) {
    throw new ShepherdError("--thread-id is required", EXIT.USAGE);
  }
  if (!opts.message || opts.message.trim() === "") {
    throw new ShepherdError("--message is required and must be non-empty", EXIT.USAGE);
  }

  const repo = await getRepoInfo();
  const prNumber = opts.prNumber ?? (await getCurrentPrNumber());
  if (prNumber === null) {
    throw new ShepherdError(
      "No open PR found for current branch. Pass a PR number explicitly.",
      EXIT.UNAVAILABLE,
    );
  }

  const currentBranch = await getCurrentBranch();
  const { stdout: localHeadOut } = await execFile("git", ["rev-parse", "HEAD"]);
  const localHeadSha = localHeadOut.trim();

  const { data } = await fetchPrBatch(prNumber, repo);
  if (!data.headRepoWithOwner) {
    throw new ShepherdError(
      `PR #${prNumber} head repository is unavailable (fork may have been deleted).`,
      EXIT.UNAVAILABLE,
    );
  }
  if (currentBranch !== data.headRefName) {
    throw new ShepherdError(
      `Current branch "${currentBranch}" does not match PR head branch "${data.headRefName}". ` +
        `Check out "${data.headRefName}" before applying suggestions.`,
      EXIT.UNAVAILABLE,
    );
  }
  if (localHeadSha !== data.headRefOid) {
    throw new ShepherdError(
      `Local HEAD ${localHeadSha} does not match PR head ${data.headRefOid}. ` +
        `Pull/rebase "${data.headRefName}" to the latest PR head and try again.`,
      EXIT.UNAVAILABLE,
    );
  }
  const thread = data.reviewThreads.find((t) => t.id === opts.threadId);
  if (!thread) {
    throw new ShepherdError(
      `Thread ${opts.threadId} not found on PR #${prNumber}.`,
      EXIT.UNAVAILABLE,
    );
  }
  if (thread.isResolved) {
    throw new ShepherdError(`Thread ${opts.threadId} is already resolved.`, EXIT.UNAVAILABLE);
  }
  if (thread.isOutdated) {
    throw new ShepherdError(`Thread ${opts.threadId} is outdated.`, EXIT.UNAVAILABLE);
  }
  if (thread.isMinimized) {
    throw new ShepherdError(`Thread ${opts.threadId} is minimized.`, EXIT.UNAVAILABLE);
  }
  if (!thread.path || thread.line === null) {
    throw new ShepherdError(`Thread ${opts.threadId} has no file/line anchor.`, EXIT.UNAVAILABLE);
  }

  // Validate the target file is clean before generating the patch, so the emitted
  // `git add -- <file>` instruction cannot accidentally stage unrelated local edits.
  const { stdout: fileStatus } = await execFile("git", [
    "status",
    "--porcelain",
    "--",
    thread.path,
  ]);
  if (fileStatus.trim() !== "") {
    throw new ShepherdError(
      `${thread.path} has uncommitted changes. Commit or stash them before running commit-suggestion.`,
      EXIT.UNAVAILABLE,
    );
  }

  const parsed = parseSuggestion(thread.body);
  if (!parsed) {
    throw new ShepherdError(
      `Thread ${opts.threadId} has no suggestion block in the comment body.`,
      EXIT.UNAVAILABLE,
    );
  }
  if (!isCommittableSuggestion(parsed)) {
    throw new ShepherdError(
      `Thread ${opts.threadId}'s suggestion body contains nested suggestion fencing or unbalanced ` +
        `3+ backtick fences — refusing to apply (could silently truncate).`,
      EXIT.UNAVAILABLE,
    );
  }

  const startLine = thread.startLine ?? thread.line;
  const endLine = thread.line;
  const filePath = thread.path;
  const originalContent = await readFile(filePath, "utf8");
  const patch = buildUnifiedDiff({
    path: filePath,
    originalContent,
    startLine,
    endLine,
    replacementLines: parsed.lines,
  });

  const coAuthor = `Co-authored-by: ${thread.author} <${thread.author}@users.noreply.github.com>`;
  const commitBody = opts.description ? `${opts.description}\n\n${coAuthor}` : coAuthor;

  const commitMessageArg = opts.message;
  const commitBodyArg = commitBody;
  const quotedPath = `'${filePath.replace(/'/g, "'\\''")}'`;
  const range = startLine === endLine ? `line ${startLine}` : `lines ${startLine}–${endLine}`;

  const sq = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
  const commitCmd = [
    "git commit",
    `-m ${sq(commitMessageArg)}`,
    ...commitBodyArg.split("\n\n").map((p) => `-m ${sq(p)}`),
  ].join(" ");
  const resolveCommand = buildPrShepherdCommand([
    "resolve",
    String(prNumber),
    "--resolve-thread-ids",
    opts.threadId,
  ]).text;

  const postActionInstructions = [
    `Apply the patch to \`${filePath}\`: run \`git apply\` with the diff shown above, or edit the file directly using the line range (${range}).`,
    `Stage the file: \`git add -- ${quotedPath}\``,
    `Commit: \`${commitCmd}\``,
    `Resolve the thread on GitHub: \`${resolveCommand}\``,
    `Push when ready: \`git push\` (or \`git push --force-with-lease\` after rebasing).`,
  ];

  return {
    pr: prNumber,
    repo: `${repo.owner}/${repo.name}`,
    threadId: opts.threadId,
    path: filePath,
    startLine,
    endLine,
    author: thread.author,
    patch,
    commitMessage: commitMessageArg,
    commitBody: commitBodyArg,
    filesToStage: [filePath],
    postActionInstructions,
  };
}
