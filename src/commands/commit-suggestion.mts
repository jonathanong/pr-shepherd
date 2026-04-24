import { execFile as execFileCb } from "node:child_process";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { getRepoInfo, getCurrentPrNumber, getPrHead, getCurrentBranch } from "../github/client.mts";
import { fetchPrBatch } from "../github/batch.mts";
import { applyResolveOptions } from "../comments/resolve.mts";
import { parseSuggestion, isCommittableSuggestion } from "../suggestions/parse.mts";
import { buildUnifiedDiff } from "../suggestions/patch.mts";
import type { CommitSuggestionResult, GlobalOptions } from "../types.mts";

const execFile = promisify(execFileCb);

export interface CommitSuggestionOptions extends GlobalOptions {
  threadId: string;
  message?: string;
  description?: string;
  dryRun?: boolean;
}

export async function runCommitSuggestion(
  opts: CommitSuggestionOptions,
): Promise<CommitSuggestionResult> {
  if (!opts.threadId) {
    throw new Error("--thread-id is required");
  }
  if (!opts.dryRun && (!opts.message || opts.message.trim() === "")) {
    throw new Error("--message is required and must be non-empty");
  }

  const { stdout: statusOut } = await execFile("git", ["status", "--porcelain"]);
  if (statusOut.trim() !== "") {
    throw new Error(
      "Working tree has uncommitted changes. Commit or stash them before running commit-suggestion.",
    );
  }

  const repo = await getRepoInfo();
  const prNumber = opts.prNumber ?? (await getCurrentPrNumber());
  if (prNumber === null) {
    throw new Error("No open PR found for current branch. Pass a PR number explicitly.");
  }

  const head = await getPrHead(prNumber, repo.owner, repo.name);
  const currentBranch = await getCurrentBranch();
  if (currentBranch !== head.ref) {
    throw new Error(
      `Current branch "${currentBranch}" does not match PR head branch "${head.ref}". ` +
        `Check out "${head.ref}" before applying suggestions.`,
    );
  }

  const { stdout: localHeadOut } = await execFile("git", ["rev-parse", "HEAD"]);
  const localHeadSha = localHeadOut.trim();
  if (localHeadSha !== head.sha) {
    throw new Error(
      `Local HEAD ${localHeadSha} does not match PR head ${head.sha}. ` +
        `Pull/rebase "${head.ref}" to the latest PR head and try again.`,
    );
  }
  const { data } = await fetchPrBatch(prNumber, repo);
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

  const patchFile = join(
    tmpdir(),
    `pr-shepherd-${Date.now()}-${Math.random().toString(36).slice(2)}.patch`,
  );

  let patchError: string | null = null;
  try {
    await writeFile(patchFile, patch, { mode: 0o600 });

    try {
      await execFile("git", ["apply", "--check", patchFile]);
    } catch (err) {
      patchError = ((err as { stderr?: string }).stderr?.trim() || String(err)).trim();
    }

    if (opts.dryRun) {
      return {
        pr: prNumber,
        repo: `${repo.owner}/${repo.name}`,
        threadId: opts.threadId,
        path: filePath,
        startLine,
        endLine,
        author: thread.author,
        applied: false as const,
        dryRun: true as const,
        valid: patchError === null,
        reason: patchError !== null ? `git apply rejected the patch: ${patchError}` : null,
        patch,
        postActionInstruction:
          patchError === null ? "Re-run without --dry-run to apply and commit." : "",
      };
    }

    if (patchError !== null) {
      return {
        pr: prNumber,
        repo: `${repo.owner}/${repo.name}`,
        threadId: opts.threadId,
        path: filePath,
        startLine,
        endLine,
        author: thread.author,
        applied: false as const,
        reason: `git apply rejected the patch: ${patchError}`,
        patch,
        postActionInstruction: "",
      };
    }

    try {
      await execFile("git", ["apply", patchFile]);
    } catch (applyErr) {
      try {
        await execFile("git", ["checkout", "--", filePath]);
      } catch {
        // best-effort rollback
      }
      throw applyErr;
    }
  } finally {
    await unlink(patchFile).catch(() => undefined);
  }

  await execFile("git", ["add", "--", filePath]);

  const coAuthor = `Co-authored-by: ${thread.author} <${thread.author}@users.noreply.github.com>`;
  const commitBody = opts.description ? `${opts.description}\n\n${coAuthor}` : coAuthor;
  await execFile("git", ["commit", "-m", opts.message!, "-m", commitBody]);

  const { stdout: shaOut } = await execFile("git", ["rev-parse", "HEAD"]);
  const commitSha = shaOut.trim();

  const resolveResult = await applyResolveOptions(prNumber, repo, {
    resolveThreadIds: [opts.threadId],
  });
  const resolveErrors = resolveResult.errors;

  return {
    pr: prNumber,
    repo: `${repo.owner}/${repo.name}`,
    threadId: opts.threadId,
    path: filePath,
    startLine,
    endLine,
    author: thread.author,
    applied: true as const,
    commitSha,
    patch,
    postActionInstruction:
      resolveErrors.length > 0
        ? `Commit created (${commitSha}), but failed to resolve thread ${opts.threadId}: ${resolveErrors.join("; ")}. Run \`git push\` then resolve manually.`
        : "Run `git push` (or `git push --force-with-lease` after rebasing) to publish the commit.",
  };
}
