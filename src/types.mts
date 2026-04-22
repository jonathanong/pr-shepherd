/** Shared type definitions for the shepherd CLI. */

// ---------------------------------------------------------------------------
// GitHub primitives
// ---------------------------------------------------------------------------

export type CheckConclusion =
  | "ACTION_REQUIRED"
  | "CANCELLED"
  | "FAILURE"
  | "NEUTRAL"
  | "SKIPPED"
  | "STALE"
  | "STARTUP_FAILURE"
  | "SUCCESS"
  | "TIMED_OUT"
  | null;

export type CheckStatus =
  | "COMPLETED"
  | "IN_PROGRESS"
  | "PENDING"
  | "QUEUED"
  | "REQUESTED"
  | "WAITING";

export type MergeableState = "CONFLICTING" | "MERGEABLE" | "UNKNOWN";

export type MergeStateStatus =
  | "BEHIND"
  | "BLOCKED"
  | "CLEAN"
  | "DIRTY"
  | "DRAFT"
  | "HAS_HOOKS"
  | "UNKNOWN"
  | "UNSTABLE";

export type ReviewDecision = "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;

// ---------------------------------------------------------------------------
// Check runs
// ---------------------------------------------------------------------------

export interface CheckRun {
  name: string;
  status: CheckStatus;
  conclusion: CheckConclusion;
  detailsUrl: string;
  /** The workflow event that triggered this run (e.g. pull_request, push, schedule). */
  event: string | null;
  /** GitHub Actions run ID extracted from detailsUrl. */
  runId: string | null;
}

export type CheckCategory = "passed" | "failing" | "in_progress" | "skipped" | "filtered";

export interface ClassifiedCheck extends CheckRun {
  category: CheckCategory;
}

export type FailureKind = "timeout" | "infrastructure" | "actionable" | "flaky";

export interface TriagedCheck extends ClassifiedCheck {
  failureKind?: FailureKind;
  /** Log excerpt for actionable failures. */
  logExcerpt?: string;
}

// ---------------------------------------------------------------------------
// Review threads and comments
// ---------------------------------------------------------------------------

export interface ReviewThread {
  id: string;
  isResolved: boolean;
  isOutdated: boolean;
  isMinimized: boolean;
  path: string | null;
  line: number | null;
  /** Start of the comment's line range. Null for single-line comments (use `line` for both). */
  startLine: number | null;
  author: string;
  body: string;
  createdAtUnix: number;
}

/**
 * Parsed GitHub ```suggestion block, attached to a review thread when the
 * reviewer left a machine-applicable replacement. The `replacement` is the
 * exact text the agent (or the CLI's commit-suggestions path) would write
 * into the file in place of lines [startLine..endLine].
 */
export interface SuggestionBlock {
  /** 1-indexed inclusive start line. Equal to `endLine` for single-line suggestions. */
  startLine: number;
  /** 1-indexed inclusive end line. */
  endLine: number;
  /** Replacement text (lines joined by \n). Empty string means "delete these lines"; a single \n means "replace with a blank line". Informational for agents — the CLI uses the full ParsedSuggestion internally. */
  replacement: string;
  /** Reviewer login, surfaced so callers can co-credit them in commits. */
  author: string;
}

export interface PrComment {
  id: string;
  isMinimized: boolean;
  author: string;
  body: string;
  createdAtUnix: number;
}

export interface Review {
  id: string;
  author: string;
  body: string;
}

// ---------------------------------------------------------------------------
// Merge status
// ---------------------------------------------------------------------------

export type ShepherdMergeStatus =
  | "CLEAN"
  | "BEHIND"
  | "CONFLICTS"
  | "BLOCKED"
  | "UNSTABLE"
  | "DRAFT"
  | "UNKNOWN";

export interface MergeStatusResult {
  status: ShepherdMergeStatus;
  state: "OPEN" | "CLOSED" | "MERGED";
  isDraft: boolean;
  mergeable: MergeableState;
  reviewDecision: ReviewDecision;
  copilotReviewInProgress: boolean;
  mergeStateStatus: MergeStateStatus;
}

// ---------------------------------------------------------------------------
// Batch query response (the combined GraphQL shape)
// ---------------------------------------------------------------------------

export interface BatchPrData {
  nodeId: string;
  number: number;
  state: "OPEN" | "CLOSED" | "MERGED";
  isDraft: boolean;
  mergeable: MergeableState;
  mergeStateStatus: MergeStateStatus;
  reviewDecision: ReviewDecision;
  headRefOid: string;
  baseRefName: string;
  reviewRequests: Array<{ login: string }>;
  latestReviews: Array<{ login: string; state: string }>;
  reviewThreads: ReviewThread[];
  comments: PrComment[];
  changesRequestedReviews: Review[];
  /** COMMENTED reviews with a non-empty, non-minimized body — surfaced for agent-driven minimize. */
  reviewSummaries: Review[];
  checks: CheckRun[];
}

// ---------------------------------------------------------------------------
// Shepherd check report (output of the check command)
// ---------------------------------------------------------------------------

export type ShepherdStatus =
  | "READY"
  | "FAILING"
  | "PENDING"
  | "IN_PROGRESS"
  | "UNRESOLVED_COMMENTS"
  | "UNKNOWN";

export interface ShepherdReport {
  pr: number;
  /** GitHub node ID of the PR — used for mutations (e.g. markPullRequestReadyForReview). */
  nodeId: string;
  repo: string;
  status: ShepherdStatus;
  /** PR base branch from the GraphQL batch. */
  baseBranch: string;
  mergeStatus: MergeStatusResult;
  checks: {
    passing: ClassifiedCheck[];
    failing: TriagedCheck[];
    inProgress: ClassifiedCheck[];
    skipped: ClassifiedCheck[];
    /** Checks filtered out because they were triggered by a non-PR event (push, schedule, etc.). */
    filtered: ClassifiedCheck[];
    filteredNames: string[];
    blockedByFilteredCheck: boolean;
  };
  threads: {
    actionable: ReviewThread[];
    autoResolved: ReviewThread[];
    autoResolveErrors: string[];
  };
  comments: {
    actionable: PrComment[];
  };
  changesRequestedReviews: Review[];
  lastPushTime?: number;
}

// ---------------------------------------------------------------------------
// Resolve command input
// ---------------------------------------------------------------------------

export interface ResolveOptions {
  resolveThreadIds?: string[];
  minimizeCommentIds?: string[];
  dismissReviewIds?: string[];
  dismissMessage?: string;
  /** When set, shepherd verifies GitHub has received this commit before resolving. */
  requireSha?: string;
}

// ---------------------------------------------------------------------------
// Agent-facing projections (used by iterate output, not check output)
// ---------------------------------------------------------------------------

/** Thread shape emitted to the monitor agent — stripped of always-false flags. */
export interface AgentThread {
  id: string;
  path: string | null;
  line: number | null;
  author: string;
  body: string;
}

/** Comment shape emitted to the monitor agent — stripped of always-false flags. */
export interface AgentComment {
  id: string;
  author: string;
  body: string;
}

/**
 * Check shape emitted to the monitor agent — no log excerpt.
 * The agent fetches logs on demand via `gh run view <runId> --log-failed`
 * when `runId` is available, and falls back to `detailsUrl` otherwise.
 */
export interface AgentCheck {
  name: string;
  runId: string | null;
  /** Fallback for checks where runId is null (e.g. external status checks). */
  detailsUrl: string | null;
  failureKind?: FailureKind;
}

// ---------------------------------------------------------------------------
// Iterate command types
// ---------------------------------------------------------------------------

export type ShepherdAction =
  | "cooldown"
  | "wait"
  | "fix_code"
  | "rerun_ci"
  | "rebase"
  | "mark_ready"
  | "cancel"
  | "escalate";

export interface EscalateDetails {
  triggers: string[];
  unresolvedThreads: AgentThread[];
  ambiguousComments: AgentComment[];
  changesRequestedReviews: Review[];
  /** Populated when fix-thrash triggered — threads that have been attempted too many times. */
  attemptHistory?: Array<{ threadId: string; attempts: number }>;
  /** One-line hint for the human on what to do. */
  suggestion: string;
  /** Full human-readable block ready to print: headline, triggers, suggestions, thread list. */
  humanMessage: string;
}

export interface IterateResultSummary {
  passing: number;
  skipped: number;
  filtered: number;
  inProgress: number;
}

export interface IterateResultBase {
  pr: number;
  repo: string;
  status: ShepherdStatus;
  /** `'UNKNOWN'` during the cooldown early-return (no sweep has been run yet). */
  state: "OPEN" | "CLOSED" | "MERGED" | "UNKNOWN";
  mergeStateStatus: MergeStateStatus;
  copilotReviewInProgress: boolean;
  isDraft: boolean;
  shouldCancel: boolean;
  remainingSeconds: number;
  summary: IterateResultSummary;
  /** Validated base branch (e.g. "main") for this PR. Echoed from `ShepherdReport.baseBranch` after `validateBaseBranch` whenever a sweep/report has run; `""` only for early-return cases where no sweep has run yet (for example, cooldown). */
  baseBranch: string;
}

export interface IterateResultCooldown extends IterateResultBase {
  action: "cooldown";
  log: string;
}

export interface IterateResultWait extends IterateResultBase {
  action: "wait";
  log: string;
}

export interface IterateResultCancel extends IterateResultBase {
  action: "cancel";
  log: string;
}

export interface ResolveCommand {
  /** Argv for spawn-style execution. May contain a `$DISMISS_MESSAGE` placeholder. `$HEAD_SHA` is never in `argv` — `renderResolveCommand` (from `commands/iterate.mts`) appends `--require-sha "$HEAD_SHA"` when rendering if `requiresHeadSha` is true. Use `renderResolveCommand` to render as a command string; don't naive-join. */
  argv: string[];
  /** When true, `renderResolveCommand` appends `--require-sha "$HEAD_SHA"` to the rendered command. */
  requiresHeadSha: boolean;
  /** Whether the model must substitute $DISMISS_MESSAGE with a specific description of the fix. */
  requiresDismissMessage: boolean;
  /** True when any mutation flag was appended (threads/comments/reviews). False for a bare `npx pr-shepherd resolve <PR>` with nothing to do. Callers use this to gate emitting a "run the resolve command" instruction — coupling to argv length would break silently if the base argv ever grew a global flag. */
  hasMutations: boolean;
}

export interface IterateResultFixCode extends IterateResultBase {
  action: "fix_code";
  fix: {
    threads: AgentThread[];
    /** Comments classified as actionable — require code changes. */
    actionableComments: AgentComment[];
    /** IDs of comments classified as noise (quota warnings, bot acks, etc.) — minimize but do not act on. */
    noiseCommentIds: string[];
    checks: AgentCheck[];
    changesRequestedReviews: Review[];
    /** Pre-built resolve command. Run after committing and pushing. */
    resolveCommand: ResolveCommand;
    /** Ordered steps for the model to follow. */
    instructions: string[];
  };
  cancelled: string[];
}

export interface ReranRun {
  runId: string;
  /** Check names within this run that triggered the rerun (multiple steps can share a run). */
  checkNames: string[];
  failureKind: "timeout" | "infrastructure";
}

export interface IterateResultRerunCi extends IterateResultBase {
  action: "rerun_ci";
  reran: ReranRun[];
  log: string;
}

export interface IterateResultRebase extends IterateResultBase {
  action: "rebase";
  rebase: {
    /** Human-readable explanation of why a rebase is needed. */
    reason: string;
    /** Complete shell script to run (includes dirty-worktree guard). */
    shellScript: string;
  };
}

export interface IterateResultMarkReady extends IterateResultBase {
  action: "mark_ready";
  markedReady: boolean;
  log: string;
}

export interface IterateResultEscalate extends IterateResultBase {
  action: "escalate";
  escalate: EscalateDetails;
}

export type IterateResult =
  | IterateResultCooldown
  | IterateResultWait
  | IterateResultCancel
  | IterateResultFixCode
  | IterateResultRerunCi
  | IterateResultRebase
  | IterateResultMarkReady
  | IterateResultEscalate;

export interface IterateCommandOptions extends GlobalOptions {
  cooldownSeconds?: number;
  readyDelaySeconds?: number;
  lastPushTime?: number;
  noAutoRerun?: boolean;
  noAutoMarkReady?: boolean;
  noAutoCancelActionable?: boolean;
}

// ---------------------------------------------------------------------------
// Commit-suggestions command
// ---------------------------------------------------------------------------

export type CommitSuggestionStatus = "applied" | "skipped";

export interface CommitSuggestionThreadResult {
  id: string;
  status: CommitSuggestionStatus;
  /** Populated for skipped threads. Not set when applied successfully. */
  reason?: string;
  /** File path the suggestion targeted. */
  path?: string;
  /** The reviewer who authored the suggestion. */
  author?: string;
}

export interface CommitSuggestionsResult {
  pr: number;
  repo: string;
  /** New HEAD SHA after the commit lands. Null when no threads applied. */
  newHeadSha: string | null;
  /** URL of the resulting commit on GitHub. Null when no threads applied. */
  commitUrl: string | null;
  /** One entry per thread requested, preserving input order. */
  threads: CommitSuggestionThreadResult[];
  /** Whether at least one suggestion was applied (commit exists on remote). */
  applied: boolean;
  /** Instruction the agent MUST follow after applied=true to sync local. */
  postActionInstruction: string;
}

// ---------------------------------------------------------------------------
// CLI options
// ---------------------------------------------------------------------------

export interface GlobalOptions {
  prNumber?: number;
  format: "text" | "json";
  noCache: boolean;
  cacheTtlSeconds: number;
}
