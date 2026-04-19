/**
 * `shepherd check [PR]`
 *
 * Read-only snapshot of PR status. Fetches CI + comments + merge status in
 * one GraphQL request, applies all classifiers, and returns a ShepherdReport.
 *
 * Exit codes:
 *   0  READY — all checks passed, no unresolved threads, CLEAN merge status.
 *   1  FAILING — one or more CI checks failed.
 *   2  IN_PROGRESS — CI checks still running.
 *   3  UNRESOLVED_COMMENTS — CI ok but actionable threads remain.
 *   1  (also) BLOCKED/CONFLICTS/UNKNOWN merge status.
 */

import { fetchPrBatch } from '../github/batch.mts'
import { getRepoInfo, getCurrentPrNumber, getMergeableState } from '../github/client.mts'
import { cacheGet, cacheSet } from '../cache/file-cache.mts'
import { classifyChecks, getCiVerdict } from '../checks/classify.mts'
import { triageFailingChecks } from '../checks/triage.mts'
import { getOutdatedThreads } from '../comments/outdated.mts'
import { autoResolveOutdated } from '../comments/resolve.mts'
import { deriveMergeStatus } from '../merge-status/derive.mts'
import type {
  GlobalOptions,
  ShepherdReport,
  ShepherdStatus,
  ClassifiedCheck,
  BatchPrData,
} from '../types.mts'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CheckCommandOptions extends GlobalOptions {
  /** When true, auto-resolve outdated threads. */
  autoResolve?: boolean
  lastPushTime?: number
  /** When true, skip fetching logs for failing checks (no failureKind set). */
  skipTriage?: boolean
}

export async function runCheck(opts: CheckCommandOptions): Promise<ShepherdReport> {
  const repo = await getRepoInfo()

  const prNumber = opts.prNumber ?? (await getCurrentPrNumber())
  if (prNumber === null) {
    throw new Error('No open PR found for current branch. Pass a PR number explicitly.')
  }

  const cacheKey = { owner: repo.owner, repo: repo.name, pr: prNumber, shape: 'batch-read' }
  // When autoResolve is enabled the command will mutate (resolve threads, minimize
  // comments) — always bypass cache so we act on fresh data, not a stale snapshot.
  const cacheOpts = { disabled: opts.noCache || opts.autoResolve, ttlSeconds: opts.cacheTtlSeconds }

  // Try cache first.
  let batchData = await cacheGet<BatchPrData>(cacheKey, cacheOpts)

  if (batchData === null) {
    const result = await fetchPrBatch(prNumber, repo)
    batchData = result.data
    // Don't cache UNKNOWN merge state — it's transient and would poison the
    // cache for the full TTL window, causing stale UNKNOWN on the next sweep.
    if (batchData.mergeable !== 'UNKNOWN' && batchData.mergeStateStatus !== 'UNKNOWN') {
      await cacheSet(cacheKey, batchData, cacheOpts)
    }
  }

  // GraphQL sometimes returns UNKNOWN for mergeable/mergeStateStatus while the
  // REST API already has the correct value. Fall back to REST in that case.
  // Skip for non-OPEN PRs — REST also returns UNKNOWN for merged/closed PRs.
  if (
    (batchData.state ?? 'OPEN') === 'OPEN' &&
    (batchData.mergeable === 'UNKNOWN' || batchData.mergeStateStatus === 'UNKNOWN')
  ) {
    const restState = await getMergeableState(prNumber, repo.owner, repo.name)
    batchData = { ...batchData, ...restState }
  }

  // Classify checks.
  const classifiedChecks = classifyChecks(batchData.checks)
  const verdict = getCiVerdict(classifiedChecks)

  const passing = classifiedChecks.filter(c => c.category === 'passed')
  const failing = classifiedChecks.filter(c => c.category === 'failing')
  const inProgress = classifiedChecks.filter(c => c.category === 'in_progress')
  const skipped = classifiedChecks.filter(c => c.category === 'skipped')
  const filtered = classifiedChecks.filter(c => c.category === 'filtered')

  // Triage failures (fetch logs) — skipped when caller will short-circuit before needing failureKind.
  const triaged =
    failing.length > 0 && !opts.skipTriage ? await triageFailingChecks(failing) : failing

  // Resolve threads and comments.
  const unresolvedThreads = batchData.reviewThreads.filter(t => !t.isResolved)
  const visibleComments = batchData.comments.filter(c => !c.isMinimized)

  // Auto-resolve outdated threads.
  const outdated = getOutdatedThreads(unresolvedThreads)
  let autoResolved: typeof outdated = []
  let autoResolveErrors: string[] = []
  if (opts.autoResolve && outdated.length > 0) {
    const { resolved: resolvedIds, errors } = await autoResolveOutdated(outdated.map(t => t.id))
    autoResolved = outdated.filter(t => resolvedIds.includes(t.id))
    autoResolveErrors = errors
  }

  const activeThreads = unresolvedThreads.filter(t => !t.isOutdated)

  // Actionable: all active threads and all visible comments (no classification — LLM handles triage).
  const actionableThreads = activeThreads
  const actionableComments = visibleComments

  // Derive merge status.
  const mergeStatus = deriveMergeStatus(batchData)

  // Derive blockedByFilteredCheck ghost state.
  const blockedByFilteredCheck =
    mergeStatus.status === 'BLOCKED' &&
    !verdict.anyFailing &&
    !verdict.anyInProgress &&
    verdict.filteredNames.length > 0

  // Compute overall status.
  const status = computeStatus(
    verdict,
    actionableThreads.length,
    actionableComments.length,
    mergeStatus.status,
    batchData.changesRequestedReviews.length,
  )

  return {
    pr: prNumber,
    repo: `${repo.owner}/${repo.name}`,
    status,
    mergeStatus,
    checks: {
      passing,
      failing: triaged,
      inProgress: inProgress as ClassifiedCheck[],
      skipped,
      filtered,
      filteredNames: verdict.filteredNames,
      blockedByFilteredCheck,
    },
    threads: {
      actionable: actionableThreads,
      autoResolved,
      autoResolveErrors,
    },
    comments: {
      actionable: actionableComments,
    },
    changesRequestedReviews: batchData.changesRequestedReviews,
    lastPushTime: opts.lastPushTime,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeStatus(
  verdict: ReturnType<typeof getCiVerdict>,
  unresolvedThreads: number,
  unresolvedComments: number,
  mergeStatus: string,
  changesRequestedReviews: number,
): ShepherdStatus {
  // Merge conflicts are always terminal regardless of CI state.
  if (mergeStatus === 'CONFLICTS') return 'FAILING'
  // Check CI state before merge-blocking states: BLOCKED/UNSTABLE/BEHIND are
  // often caused by CI not having passed yet, so they shouldn't mask IN_PROGRESS.
  if (verdict.anyFailing) return 'FAILING'
  if (verdict.anyInProgress) return 'IN_PROGRESS'
  if (mergeStatus === 'BLOCKED' || mergeStatus === 'UNSTABLE' || mergeStatus === 'BEHIND')
    return 'FAILING'
  if (mergeStatus === 'UNKNOWN') return 'UNKNOWN'
  if (changesRequestedReviews > 0) return 'UNRESOLVED_COMMENTS'
  if (unresolvedThreads > 0 || unresolvedComments > 0) return 'UNRESOLVED_COMMENTS'
  // DRAFT is treated the same as CLEAN for readiness — marking the PR ready resolves it.
  if ((mergeStatus === 'CLEAN' || mergeStatus === 'DRAFT') && verdict.allPassed) return 'READY'
  return 'UNKNOWN'
}
