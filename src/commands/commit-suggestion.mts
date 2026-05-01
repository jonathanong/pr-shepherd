import { execFile as execFileCb } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

import { getRepoInfo, getCurrentPrNumber, getCurrentBranch } from "../github/client.mts";
import { fetchPrBatch } from "../github/batch.mts";
import { parseSuggestion, isCommittableSuggestion } from "../suggestions/parse.mts";
import { buildUnifiedDiff } from "../suggestions/patch.mts";
import type { CommitSuggestionResult, GlobalOptions } from "../types.mts";

const execFile = promisify(execFileCb);

export interface CommitSuggestionOptions extends GlobalOptions {
  threadId: string;
  message: string;
  description?: string;
}

export async function runCommitSuggestion(
  opts: CommitSuggestionOptions,
): Promise<CommitSuggestionResult> {
  if (!opts.threadId) {
    throw new Error("--thread-id is required");
  }
  if (!opts.message || opts.message.trim() === "") {
    throw new Error("--message is required and must be non-empty");
  }

  const repo = await getRepoInfo();
  const prNumber = opts.prNumber ?? (await getCurrentPrNumber());
  if (prNumber === null) {
    throw new Error("No open PR found for current branch. Pass a PR number explicitly.");
  }

  const currentBranch = await getCurrentBranch();
  const { stdout: localHeadOut } = await execFile("git", ["rev-parse", "HEAD"]);
  const localHeadSha = localHeadOut.trim();

  const { data } = await fetchPrBatch(prNumber, repo);
  if (!data.headRepoWithOwner) {
    throw new Error(`PR #${prNumber} head repository is unavailable (fork may have been deleted).`);
  }
  if (currentBranch !== data.headRefName) {
    throw new Error(
      `Current branch "${currentBranch}" does not match PR head branch "${data.headRefName}". ` +
        `Check out "${data.headRefName}" before applying suggestions.`,
    );
  }
  if (localHeadSha !== data.headRefOid) {
    throw new Error(
      `Local HEAD ${localHeadSha} does not match PR head ${data.headRefOid}. ` +
        `Pull/rebase "${data.headRefName}" to the latest PR head and try again.`,
    );
  }
  const thread = data.reviewThreads.find((t) => t.id === opts.threadId);
  if (!thread) {
    throw new Error(`Thread ${opts.threadId} not found on PR #${prNumber}.`);
  }
  if (thread.isResolved) {
    throw new Error(`Thread ${opts.threadId} is already resolved.`);
  }
  if (thread.isOutdated) {
    throw new Error(`Thread ${opts.threadId} is outdated.`);
  }
  if (thread.isMinimized) {
    throw new Error(`Thread ${opts.threadId} is minimized.`);
  }
  if (!thread.path || thread.line === null) {
    throw new Error(`Thread ${opts.threadId} has no file/line anchor.`);
  }

  const parsed = parseSuggestion(thread.body);
  if (!parsed) {
    throw new Error(`Thread ${opts.threadId} has no suggestion block in the comment body.`);
  }
  if (!isCommittableSuggestion(parsed)) {
    throw new Error(
      `Thread ${opts.threadId}'s suggestion body contains nested suggestion fencing or unbalanced ` +
        `3+ backtick fences — refusing to apply (could silently truncate).`,
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

  const postActionInstructions = [
    `Apply the patch to \`${filePath}\`: run \`git apply\` with the diff shown above, or edit the file directly using the line range (${startLine === endLine ? `line ${startLine}` : `lines ${startLine}–${endLine}`}).`,
    `Stage the file: \`git add -- ${filePath}\``,
    `Commit: \`git commit -m ${JSON.stringify(commitMessageArg)} -m ${JSON.stringify(commitBodyArg)}\``,
    `Resolve the thread on GitHub: \`npx pr-shepherd resolve ${prNumber} --resolve-thread-ids ${opts.threadId}\``,
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
