/**
 * `shepherd commit-suggestions <PR> --thread-ids ID1,ID2,...`
 *
 * Applies reviewer-authored ```suggestion blocks as a single remote commit via
 * the `createCommitOnBranch` GraphQL mutation, then resolves the threads that
 * landed. Replaces the manual "open file, re-type the fix" workflow for
 * suggestion-carrying threads.
 *
 * Why server-side:
 *   - createCommitOnBranch produces a verified commit signed by the
 *     authenticated user, with reviewer(s) as `Co-authored-by` trailers.
 *   - Keeps the operation atomic — one mutation = commit exists on remote.
 *   - Avoids client-side push contention with the agent's other git activity.
 *
 * Side effect: the agent's local checkout is now one commit behind remote and
 * MUST `git pull --ff-only` before making further edits. The result object
 * includes a `postActionInstruction` string the skill surfaces verbatim.
 */

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

import {
  getRepoInfo,
  getCurrentPrNumber,
  getPrHead,
  getFileContents,
  graphql,
} from "../github/client.mts";
import { fetchPrBatch } from "../github/batch.mts";
import { applyResolveOptions } from "../comments/resolve.mts";
import { CREATE_COMMIT_ON_BRANCH_MUTATION } from "../github/queries.mts";
import { parseSuggestion, applySuggestionToFile } from "../suggestions/parse.mts";
import type {
  CommitSuggestionsResult,
  CommitSuggestionThreadResult,
  GlobalOptions,
  ReviewThread,
} from "../types.mts";

const execFile = promisify(execFileCb);

export interface CommitSuggestionsOptions extends GlobalOptions {
  threadIds: string[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function runCommitSuggestions(
  opts: CommitSuggestionsOptions,
): Promise<CommitSuggestionsResult> {
  if (opts.threadIds.length === 0) {
    throw new Error("--thread-ids is required and must contain at least one ID");
  }

  await assertWorktreeClean();

  const repo = await getRepoInfo();
  const prNumber = opts.prNumber ?? (await getCurrentPrNumber());
  if (prNumber === null) {
    throw new Error("No open PR found for current branch. Pass a PR number explicitly.");
  }

  const { data } = await fetchPrBatch(prNumber, repo);
  const threadsById = new Map<string, ReviewThread>(data.reviewThreads.map((t) => [t.id, t]));

  // Phase 1: classify each requested thread. Skipped ones never need a file fetch.
  const perThread: CommitSuggestionThreadResult[] = [];
  const applicable: Array<{
    id: string;
    path: string;
    startLine: number;
    endLine: number;
    lines: readonly string[];
    author: string;
  }> = [];

  for (const id of opts.threadIds) {
    const thread = threadsById.get(id);
    if (!thread) {
      perThread.push({ id, status: "skipped", reason: "thread not found on this PR" });
      continue;
    }
    if (thread.isResolved) {
      perThread.push({ id, status: "skipped", reason: "thread already resolved" });
      continue;
    }
    if (thread.isOutdated) {
      perThread.push({ id, status: "skipped", reason: "thread is outdated" });
      continue;
    }
    if (!thread.path || thread.line === null) {
      perThread.push({ id, status: "skipped", reason: "thread has no file/line anchor" });
      continue;
    }
    const parsed = parseSuggestion(thread.body);
    if (!parsed) {
      perThread.push({ id, status: "skipped", reason: "no suggestion block in comment body" });
      continue;
    }
    applicable.push({
      id,
      path: thread.path,
      startLine: thread.startLine ?? thread.line,
      endLine: thread.line,
      lines: parsed.lines,
      author: thread.author,
    });
  }

  if (applicable.length === 0) {
    return buildResult(prNumber, repo, perThread, null, null);
  }

  const head = await getPrHead(prNumber, repo.owner, repo.name);

  // Phase 2: per-file application. Within each file, apply from bottom-up so
  // earlier line ranges stay valid; skip any suggestion whose range overlaps
  // one already applied to the same file.
  const byPath = new Map<string, typeof applicable>();
  for (const s of applicable) {
    const arr = byPath.get(s.path) ?? [];
    arr.push(s);
    byPath.set(s.path, arr);
  }

  const additions: Array<{ path: string; contents: string }> = [];
  const appliedIds = new Set<string>();
  const appliedAuthors = new Set<string>();

  for (const [path, suggestions] of byPath) {
    // Sort descending by startLine so later edits don't shift earlier ones' line numbers.
    const sorted = [...suggestions].sort((a, b) => b.startLine - a.startLine);
    let fileContent: string;
    try {
      fileContent = await getFileContents(head.repoWithOwner, path, head.sha);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      for (const s of suggestions) {
        perThread.push({
          id: s.id,
          status: "skipped",
          reason: `could not fetch file: ${msg}`,
          path,
          author: s.author,
        });
      }
      continue;
    }

    let lowestAppliedStart = Number.POSITIVE_INFINITY;
    for (const s of sorted) {
      if (s.endLine >= lowestAppliedStart) {
        perThread.push({
          id: s.id,
          status: "skipped",
          reason: "range overlaps another suggestion on the same file",
          path,
          author: s.author,
        });
        continue;
      }
      try {
        fileContent = applySuggestionToFile(fileContent, s.startLine, s.endLine, s.lines);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        perThread.push({ id: s.id, status: "skipped", reason: msg, path, author: s.author });
        continue;
      }
      lowestAppliedStart = s.startLine;
      appliedIds.add(s.id);
      appliedAuthors.add(s.author);
      perThread.push({ id: s.id, status: "applied", path, author: s.author });
    }

    if (sorted.some((s) => appliedIds.has(s.id))) {
      additions.push({
        path,
        contents: Buffer.from(fileContent, "utf8").toString("base64"),
      });
    }
  }

  if (additions.length === 0) {
    return buildResult(prNumber, repo, reorderByInput(opts.threadIds, perThread), null, null);
  }

  // Phase 3: commit via GraphQL.
  const message = buildCommitMessage(appliedIds.size, appliedAuthors);
  const commitRes = await graphql<{
    createCommitOnBranch: { commit: { oid: string; url: string } | null };
  }>(CREATE_COMMIT_ON_BRANCH_MUTATION, {
    repoWithOwner: head.repoWithOwner,
    branch: head.ref,
    expectedHeadOid: head.sha,
    message,
    additions,
  });
  const commit = commitRes.data.createCommitOnBranch.commit;
  if (!commit) {
    throw new Error("createCommitOnBranch returned no commit — branch may have diverged.");
  }

  // Phase 4: resolve applied threads. applyResolveOptions collects per-ID
  // failures into its `errors` array instead of throwing; surface them here
  // so commit-suggestions doesn't silently report success when some threads
  // were committed but not resolved.
  const resolveResult = await applyResolveOptions(prNumber, repo, {
    resolveThreadIds: [...appliedIds],
  });
  if (resolveResult.errors.length > 0) {
    throw new Error(
      `commit created (${commit.oid}), but failed to resolve one or more applied threads: ${resolveResult.errors.join("; ")}`,
    );
  }

  return buildResult(
    prNumber,
    repo,
    reorderByInput(opts.threadIds, perThread),
    commit.oid,
    commit.url,
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function assertWorktreeClean(): Promise<void> {
  const { stdout } = await execFile("git", ["status", "--porcelain"]);
  if (stdout.trim() !== "") {
    throw new Error(
      "Working tree has uncommitted changes. Commit or stash them before running commit-suggestions — " +
        "the command creates a commit server-side and you will need to `git pull --ff-only` afterwards.",
    );
  }
}

function buildCommitMessage(
  count: number,
  authors: Set<string>,
): { headline: string; body?: string } {
  const headline =
    count === 1 && authors.size === 1
      ? `Apply suggestion from @${[...authors][0]}`
      : `Apply ${count} review suggestion(s)`;
  const coAuthors = [...authors].map(
    (login) => `Co-authored-by: ${login} <${login}@users.noreply.github.com>`,
  );
  return coAuthors.length > 0 ? { headline, body: coAuthors.join("\n") } : { headline };
}

function buildResult(
  pr: number,
  repo: { owner: string; name: string },
  threads: CommitSuggestionThreadResult[],
  newHeadSha: string | null,
  commitUrl: string | null,
): CommitSuggestionsResult {
  const applied = threads.some((t) => t.status === "applied");
  const postAction = applied
    ? "Your local checkout is now one commit behind remote. Run `git pull --ff-only` before making any further edits."
    : "No commit was created. Nothing to pull.";
  return {
    pr,
    repo: `${repo.owner}/${repo.name}`,
    newHeadSha,
    commitUrl,
    threads,
    applied,
    postActionInstruction: postAction,
  };
}

/**
 * Output `threads` array preserves the caller's input order so the skill can
 * walk the list in parallel with its own bookkeeping. Skipped/applied entries
 * get pushed in varying order during apply; this sorts them back.
 */
function reorderByInput(
  inputIds: string[],
  results: CommitSuggestionThreadResult[],
): CommitSuggestionThreadResult[] {
  const byId = new Map(results.map((r) => [r.id, r]));
  return inputIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
}
