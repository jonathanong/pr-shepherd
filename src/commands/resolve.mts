/**
 * `shepherd resolve [PR] [flags]`
 *
 * Two modes:
 *
 *   Fetch mode (--fetch or no mutation flags):
 *     Auto-resolves outdated threads and returns all active threads,
 *     visible comments, and CHANGES_REQUESTED reviews for LLM triage.
 *     Sonnet reads this output, applies code fixes, pushes, then calls
 *     resolve in mutation mode to resolve/minimize/dismiss by ID.
 *
 *   Mutation mode (--resolve-thread-ids, --minimize-comment-ids, --dismiss-review-ids):
 *     Resolves/minimizes/dismisses by ID. Optionally verifies the push
 *     has landed on GitHub before mutating (--require-sha).
 */

import { getRepoInfo, getCurrentPrNumber } from "../github/client.mts";
import { fetchPrBatch } from "../github/batch.mts";
import { getOutdatedThreads } from "../comments/outdated.mts";
import { autoResolveOutdated, applyResolveOptions } from "../comments/resolve.mts";
import { loadConfig } from "../config/load.mts";
import { parseSuggestion } from "../suggestions/parse.mts";
import type {
  GlobalOptions,
  ResolveOptions,
  ReviewThread,
  PrComment,
  Review,
  SuggestionBlock,
} from "../types.mts";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type FetchThread = Omit<ReviewThread, "isResolved" | "isOutdated"> & {
  /** Present when the comment body contains a parseable ```suggestion block. */
  suggestion?: SuggestionBlock;
};

export interface FetchResult {
  actionableThreads: FetchThread[];
  actionableComments: PrComment[];
  changesRequestedReviews: Review[];
  reviewSummaries: Review[];
  /** Mirrors `actions.commitSuggestions` config. When true, the resolve skill prefers the commit-suggestions path for threads with a suggestion block. */
  commitSuggestionsEnabled: boolean;
}

export interface ResolveCommandOptions extends GlobalOptions {
  /** When true, run in fetch mode regardless of other flags. */
  fetch?: boolean;
}

/**
 * Fetch mode: auto-resolve outdated threads and return all active items for LLM triage.
 */
export async function runResolveFetch(opts: ResolveCommandOptions): Promise<FetchResult> {
  const repo = await getRepoInfo();
  const prNumber = opts.prNumber ?? (await getCurrentPrNumber());
  if (prNumber === null) {
    throw new Error("No open PR found for current branch. Pass a PR number explicitly.");
  }

  // Always bypass cache for resolve — we need fresh data before mutating.
  const { data } = await fetchPrBatch(prNumber, repo);

  const unresolvedThreads = data.reviewThreads.filter((t) => !t.isResolved && !t.isMinimized);
  const visibleComments = data.comments.filter((c) => !c.isMinimized);

  // Auto-resolve outdated.
  const outdated = getOutdatedThreads(unresolvedThreads);
  if (outdated.length > 0) {
    const { errors } = await autoResolveOutdated(outdated.map((t) => t.id));
    if (errors.length > 0) {
      throw new Error(`Failed to auto-resolve outdated threads: ${errors.join(", ")}`);
    }
  }

  const activeThreads = unresolvedThreads.filter((t) => !t.isOutdated);

  const cfg = loadConfig();

  const actionableThreads: FetchThread[] = activeThreads.map(
    ({ isResolved: _r, isOutdated: _o, ...rest }) => {
      const thread: FetchThread = rest;
      const suggestion = extractSuggestion(rest);
      if (suggestion) thread.suggestion = suggestion;
      return thread;
    },
  );

  return {
    actionableThreads,
    actionableComments: visibleComments,
    changesRequestedReviews: data.changesRequestedReviews,
    reviewSummaries: cfg.resolve.fetchReviewSummaries ? data.reviewSummaries : [],
    commitSuggestionsEnabled: cfg.actions.commitSuggestions,
  };
}

/**
 * Attach a parsed suggestion block to a thread if the comment body contains one
 * and the thread has a resolvable line anchor. Threads without `path`/`line`
 * (rare — usually file-level comments) can't accept a suggestion commit.
 */
function extractSuggestion(
  thread: Omit<ReviewThread, "isResolved" | "isOutdated">,
): SuggestionBlock | null {
  if (!thread.path || thread.line === null) return null;
  const parsed = parseSuggestion(thread.body);
  if (!parsed) return null;
  const startLine = thread.startLine ?? thread.line;
  return {
    startLine,
    endLine: thread.line,
    replacement: parsed.replacement,
    author: thread.author,
  };
}

/**
 * Mutation mode: resolve/minimize/dismiss by ID.
 */
export async function runResolveMutate(
  opts: ResolveCommandOptions & ResolveOptions,
): Promise<import("../comments/resolve.mts").ResolveResult> {
  const repo = await getRepoInfo();
  const prNumber = opts.prNumber ?? (await getCurrentPrNumber());
  if (prNumber === null) {
    throw new Error("No open PR found for current branch. Pass a PR number explicitly.");
  }

  return applyResolveOptions(prNumber, repo, {
    resolveThreadIds: opts.resolveThreadIds,
    minimizeCommentIds: opts.minimizeCommentIds,
    dismissReviewIds: opts.dismissReviewIds,
    dismissMessage: opts.dismissMessage,
    requireSha: opts.requireSha,
  });
}
