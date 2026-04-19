/**
 * Batched mutations for resolving threads, minimizing comments, and dismissing reviews.
 *
 * The three mutation types (resolve / minimize / dismiss) are run sequentially so total
 * in-flight mutations never exceed CONCURRENCY at once, keeping us well within GitHub's
 * secondary rate-limit window.
 *
 * Push-before-resolve safety:
 *   When `requireSha` is set, shepherd verifies that GitHub has received that
 *   commit before issuing any resolve/dismiss mutations. It polls up to 20 seconds.
 *   If the push hasn't landed, shepherd throws rather than resolving prematurely
 *   (which could allow auto-merge before reviewers see the fix).
 */

import { graphql, getPrHeadSha, type RepoInfo } from '../github/client.mts'
import {
  RESOLVE_THREAD_MUTATION,
  MINIMIZE_COMMENT_MUTATION,
  DISMISS_REVIEW_MUTATION,
} from '../github/queries.mts'
import type { ResolveOptions } from '../types.mts'
import config from '../config.json' with { type: 'json' }

const {
  concurrency: CONCURRENCY,
  shaPollIntervalMs: SHA_POLL_INTERVAL_MS,
  shaPollMaxAttempts: SHA_POLL_MAX_ATTEMPTS,
} = config.resolve

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ResolveResult {
  resolvedThreads: string[]
  minimizedComments: string[]
  dismissedReviews: string[]
  errors: string[]
}

/**
 * Execute all requested resolve/minimize/dismiss mutations.
 *
 * @throws Error if `requireSha` is set and GitHub hasn't received that commit
 *              within the polling window.
 */
export async function applyResolveOptions(
  pr: number,
  repo: RepoInfo,
  opts: ResolveOptions,
): Promise<ResolveResult> {
  // Require --message when dismissing reviews.
  if ((opts.dismissReviewIds?.length ?? 0) > 0 && !opts.dismissMessage) {
    throw new Error('--message is required when dismissing reviews')
  }

  // Safety check: verify the push landed before resolving.
  if (opts.requireSha) {
    await waitForSha(pr, repo, opts.requireSha)
  }

  const result: ResolveResult = {
    resolvedThreads: [],
    minimizedComments: [],
    dismissedReviews: [],
    errors: [],
  }

  await runBatched(
    opts.resolveThreadIds ?? [],
    id => resolveThread(id),
    result.resolvedThreads,
    result.errors,
  )
  await runBatched(
    opts.minimizeCommentIds ?? [],
    id => minimizeComment(id, 'RESOLVED'),
    result.minimizedComments,
    result.errors,
  )
  await runBatched(
    opts.dismissReviewIds ?? [],
    id => dismissReview(id, opts.dismissMessage!),
    result.dismissedReviews,
    result.errors,
  )

  return result
}

/**
 * Auto-resolve a batch of outdated threads via the resolveReviewThread mutation.
 */
export async function autoResolveOutdated(
  threadIds: string[],
): Promise<{ resolved: string[]; errors: string[] }> {
  const resolved: string[] = []
  const errors: string[] = []
  await runBatched(threadIds, id => resolveThread(id), resolved, errors)
  return { resolved, errors }
}

// ---------------------------------------------------------------------------
// Mutation helpers
// ---------------------------------------------------------------------------

async function resolveThread(threadId: string): Promise<void> {
  await graphql(RESOLVE_THREAD_MUTATION, { threadId })
}

async function minimizeComment(
  commentId: string,
  classifier: 'RESOLVED' | 'OFF_TOPIC',
): Promise<void> {
  await graphql(MINIMIZE_COMMENT_MUTATION, { commentId, classifier })
}

async function dismissReview(reviewId: string, message: string): Promise<void> {
  await graphql(DISMISS_REVIEW_MUTATION, { reviewId, message })
}

// ---------------------------------------------------------------------------
// Concurrency helper
// ---------------------------------------------------------------------------

async function runBatched(
  ids: string[],
  fn: (id: string) => Promise<void>,
  successList: string[],
  errorList: string[],
): Promise<void> {
  // Process in chunks of CONCURRENCY.
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const chunk = ids.slice(i, i + CONCURRENCY)
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(
      chunk.map(async id => {
        try {
          await fn(id)
          successList.push(id)
        } catch (err) {
          errorList.push(`${id}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }),
    )
  }
}

// ---------------------------------------------------------------------------
// SHA polling
// ---------------------------------------------------------------------------

async function waitForSha(pr: number, repo: RepoInfo, expectedSha: string): Promise<void> {
  for (let attempt = 0; attempt < SHA_POLL_MAX_ATTEMPTS; attempt++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const currentSha = await getPrHeadSha(pr, repo.owner, repo.name)
      if (currentSha === expectedSha) return
    } catch (err) {
      // Transient network / 5xx error — keep polling unless this is the last attempt.
      if (attempt === SHA_POLL_MAX_ATTEMPTS - 1) throw err
    }

    if (attempt < SHA_POLL_MAX_ATTEMPTS - 1) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(SHA_POLL_INTERVAL_MS)
    }
  }

  // Total actual wait = (SHA_POLL_MAX_ATTEMPTS - 1) * SHA_POLL_INTERVAL_MS (no sleep after last poll).
  throw new Error(
    `Timeout: GitHub PR #${pr} head SHA has not updated to ${expectedSha} after ${
      ((SHA_POLL_MAX_ATTEMPTS - 1) * SHA_POLL_INTERVAL_MS) / 1000
    }s. Push may still be in transit — retry shortly.`,
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
