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

import { getRepoInfo, getCurrentPrNumber } from '../github/client.mts'
import { fetchPrBatch } from '../github/batch.mts'
import { getOutdatedThreads } from '../comments/outdated.mts'
import { autoResolveOutdated, applyResolveOptions } from '../comments/resolve.mts'
import type { GlobalOptions, ResolveOptions, ReviewThread, PrComment, Review } from '../types.mts'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface FetchResult {
  autoResolved: ReviewThread[]
  actionableThreads: ReviewThread[]
  actionableComments: PrComment[]
  changesRequestedReviews: Review[]
}

export interface ResolveCommandOptions extends GlobalOptions {
  /** When true, run in fetch mode regardless of other flags. */
  fetch?: boolean
}

/**
 * Fetch mode: auto-resolve outdated threads and return all active items for LLM triage.
 */
export async function runResolveFetch(opts: ResolveCommandOptions): Promise<FetchResult> {
  const repo = await getRepoInfo()
  const prNumber = opts.prNumber ?? (await getCurrentPrNumber())
  if (prNumber === null) {
    throw new Error('No open PR found for current branch. Pass a PR number explicitly.')
  }

  // Always bypass cache for resolve — we need fresh data before mutating.
  const { data } = await fetchPrBatch(prNumber, repo)

  const unresolvedThreads = data.reviewThreads.filter(t => !t.isResolved)
  const visibleComments = data.comments.filter(c => !c.isMinimized)

  // Auto-resolve outdated.
  const outdated = getOutdatedThreads(unresolvedThreads)
  let autoResolved: ReviewThread[] = []
  if (outdated.length > 0) {
    const { resolved: resolvedIds } = await autoResolveOutdated(outdated.map(t => t.id))
    autoResolved = outdated.filter(t => resolvedIds.includes(t.id))
  }

  const activeThreads = unresolvedThreads.filter(t => !t.isOutdated)

  return {
    autoResolved,
    actionableThreads: activeThreads,
    actionableComments: visibleComments,
    changesRequestedReviews: data.changesRequestedReviews,
  }
}

/**
 * Mutation mode: resolve/minimize/dismiss by ID.
 */
export async function runResolveMutate(
  opts: ResolveCommandOptions & ResolveOptions,
): Promise<import('../comments/resolve.mts').ResolveResult> {
  const repo = await getRepoInfo()
  const prNumber = opts.prNumber ?? (await getCurrentPrNumber())
  if (prNumber === null) {
    throw new Error('No open PR found for current branch. Pass a PR number explicitly.')
  }

  return applyResolveOptions(prNumber, repo, {
    resolveThreadIds: opts.resolveThreadIds,
    minimizeCommentIds: opts.minimizeCommentIds,
    dismissReviewIds: opts.dismissReviewIds,
    dismissMessage: opts.dismissMessage,
    requireSha: opts.requireSha,
  })
}
