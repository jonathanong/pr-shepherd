/** Shared type definitions for the shepherd CLI. */

// ---------------------------------------------------------------------------
// GitHub primitives
// ---------------------------------------------------------------------------

export type CheckConclusion =
  | 'ACTION_REQUIRED'
  | 'CANCELLED'
  | 'FAILURE'
  | 'NEUTRAL'
  | 'SKIPPED'
  | 'STALE'
  | 'STARTUP_FAILURE'
  | 'SUCCESS'
  | 'TIMED_OUT'
  | null

export type CheckStatus =
  | 'COMPLETED'
  | 'IN_PROGRESS'
  | 'PENDING'
  | 'QUEUED'
  | 'REQUESTED'
  | 'WAITING'

export type MergeableState = 'CONFLICTING' | 'MERGEABLE' | 'UNKNOWN'

export type MergeStateStatus =
  | 'BEHIND'
  | 'BLOCKED'
  | 'CLEAN'
  | 'DIRTY'
  | 'DRAFT'
  | 'HAS_HOOKS'
  | 'UNKNOWN'
  | 'UNSTABLE'

export type ReviewDecision = 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null

// ---------------------------------------------------------------------------
// Check runs
// ---------------------------------------------------------------------------

export interface CheckRun {
  name: string
  status: CheckStatus
  conclusion: CheckConclusion
  detailsUrl: string
  /** The workflow event that triggered this run (e.g. pull_request, push, schedule). */
  event: string | null
  /** GitHub Actions run ID extracted from detailsUrl. */
  runId: string | null
}

export type CheckCategory = 'passed' | 'failing' | 'in_progress' | 'skipped' | 'filtered'

export interface ClassifiedCheck extends CheckRun {
  category: CheckCategory
}

export type FailureKind = 'timeout' | 'infrastructure' | 'actionable' | 'flaky'

export interface TriagedCheck extends ClassifiedCheck {
  failureKind?: FailureKind
  /** Log excerpt for actionable failures. */
  logExcerpt?: string
}

// ---------------------------------------------------------------------------
// Review threads and comments
// ---------------------------------------------------------------------------

export interface ReviewThread {
  id: string
  isResolved: boolean
  isOutdated: boolean
  path: string | null
  line: number | null
  author: string
  body: string
  createdAtUnix: number
}

export interface PrComment {
  id: string
  isMinimized: boolean
  author: string
  body: string
  createdAtUnix: number
}

export interface Review {
  id: string
  author: string
  body: string
}

// ---------------------------------------------------------------------------
// Merge status
// ---------------------------------------------------------------------------

export type ShepherdMergeStatus =
  | 'CLEAN'
  | 'BEHIND'
  | 'CONFLICTS'
  | 'BLOCKED'
  | 'UNSTABLE'
  | 'DRAFT'
  | 'UNKNOWN'

export interface MergeStatusResult {
  status: ShepherdMergeStatus
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  isDraft: boolean
  mergeable: MergeableState
  reviewDecision: ReviewDecision
  copilotReviewInProgress: boolean
  mergeStateStatus: MergeStateStatus
}

// ---------------------------------------------------------------------------
// Batch query response (the combined GraphQL shape)
// ---------------------------------------------------------------------------

export interface BatchPrData {
  number: number
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  isDraft: boolean
  mergeable: MergeableState
  mergeStateStatus: MergeStateStatus
  reviewDecision: ReviewDecision
  headRefOid: string
  reviewRequests: Array<{ login: string }>
  latestReviews: Array<{ login: string; state: string }>
  reviewThreads: ReviewThread[]
  comments: PrComment[]
  changesRequestedReviews: Review[]
  checks: CheckRun[]
}

// ---------------------------------------------------------------------------
// Shepherd check report (output of the check command)
// ---------------------------------------------------------------------------

export type ShepherdStatus = 'READY' | 'FAILING' | 'IN_PROGRESS' | 'UNRESOLVED_COMMENTS' | 'UNKNOWN'

export interface ShepherdReport {
  pr: number
  repo: string
  status: ShepherdStatus
  mergeStatus: MergeStatusResult
  checks: {
    passing: ClassifiedCheck[]
    failing: TriagedCheck[]
    inProgress: ClassifiedCheck[]
    skipped: ClassifiedCheck[]
    /** Checks filtered out because they were triggered by a non-PR event (push, schedule, etc.). */
    filtered: ClassifiedCheck[]
    filteredNames: string[]
    blockedByFilteredCheck: boolean
  }
  threads: {
    actionable: ReviewThread[]
    autoResolved: ReviewThread[]
    autoResolveErrors: string[]
  }
  comments: {
    actionable: PrComment[]
  }
  changesRequestedReviews: Review[]
  lastPushTime?: number
}

// ---------------------------------------------------------------------------
// Resolve command input
// ---------------------------------------------------------------------------

export interface ResolveOptions {
  resolveThreadIds?: string[]
  minimizeCommentIds?: string[]
  dismissReviewIds?: string[]
  dismissMessage?: string
  /** When set, shepherd verifies GitHub has received this commit before resolving. */
  requireSha?: string
}

// ---------------------------------------------------------------------------
// Iterate command types
// ---------------------------------------------------------------------------

export type ShepherdAction =
  | 'cooldown'
  | 'wait'
  | 'fix_code'
  | 'rerun_ci'
  | 'rebase'
  | 'mark_ready'
  | 'cancel'
  | 'escalate'

export interface EscalateDetails {
  triggers: string[]
  unresolvedThreads: ReviewThread[]
  ambiguousComments: PrComment[]
  changesRequestedReviews: Review[]
  /** Populated when fix-thrash triggered — threads that have been attempted too many times. */
  attemptHistory?: Array<{ threadId: string; attempts: number }>
  /** One-line hint for the human on what to do. */
  suggestion: string
}

export interface IterateResultSummary {
  passing: number
  skipped: number
  filtered: number
  inProgress: number
}

export interface IterateResultBase {
  pr: number
  repo: string
  status: ShepherdStatus
  /** `'UNKNOWN'` during the cooldown early-return (no sweep has been run yet). */
  state: 'OPEN' | 'CLOSED' | 'MERGED' | 'UNKNOWN'
  mergeStateStatus: MergeStateStatus
  copilotReviewInProgress: boolean
  isDraft: boolean
  shouldCancel: boolean
  remainingSeconds: number
  summary: IterateResultSummary
}

export interface IterateResultCooldown extends IterateResultBase {
  action: 'cooldown'
}

export interface IterateResultWait extends IterateResultBase {
  action: 'wait'
}

export interface IterateResultCancel extends IterateResultBase {
  action: 'cancel'
}

export interface IterateResultFixCode extends IterateResultBase {
  action: 'fix_code'
  fix: {
    threads: ReviewThread[]
    comments: PrComment[]
    checks: TriagedCheck[]
    changesRequestedReviews: Review[]
  }
  cancelled: string[]
}

export interface IterateResultRerunCi extends IterateResultBase {
  action: 'rerun_ci'
  reran: string[]
}

export interface IterateResultRebase extends IterateResultBase {
  action: 'rebase'
}

export interface IterateResultMarkReady extends IterateResultBase {
  action: 'mark_ready'
  markedReady: boolean
}

export interface IterateResultEscalate extends IterateResultBase {
  action: 'escalate'
  escalate: EscalateDetails
}

export type IterateResult =
  | IterateResultCooldown
  | IterateResultWait
  | IterateResultCancel
  | IterateResultFixCode
  | IterateResultRerunCi
  | IterateResultRebase
  | IterateResultMarkReady
  | IterateResultEscalate

export interface IterateCommandOptions extends GlobalOptions {
  cooldownSeconds?: number
  readyDelaySeconds?: number
  lastPushTime?: number
  noAutoRerun?: boolean
  noAutoMarkReady?: boolean
  noAutoCancelActionable?: boolean
}

// ---------------------------------------------------------------------------
// CLI options
// ---------------------------------------------------------------------------

export interface GlobalOptions {
  prNumber?: number
  format: 'text' | 'json'
  noCache: boolean
  cacheTtlSeconds: number
}
