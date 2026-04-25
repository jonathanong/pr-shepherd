// GitHub primitives, check runs, review threads, and batch PR data types.

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
  /** One-line status text shown in the GitHub UI (CheckRun.title or first line of summary; StatusContext.description). */
  summary?: string;
}

type CheckCategory = "passed" | "failing" | "in_progress" | "skipped" | "filtered";

export interface ClassifiedCheck extends CheckRun {
  category: CheckCategory;
}

export interface TriagedCheck extends ClassifiedCheck {
  /** Workflow display name (e.g. `"CI"`). Populated when available from the jobs API; may be `undefined` on fetch failure or when no matching job is found. */
  workflowName?: string;
  /** Name of the matched job (e.g. `"tests (ubuntu)"`). Distinct from the check name for matrix builds. */
  jobName?: string;
  /** Name of the first failed step in the matched job (e.g. `"Run tests"`). */
  failedStep?: string;
  /** Last N lines of the failing job's log. `undefined` when no matching job is found or log fetch fails. */
  logTail?: string;
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
  url: string;
  createdAtUnix: number;
}

/**
 * Parsed GitHub ```suggestion block, attached to a review thread when the
 * reviewer left a machine-applicable replacement. The `lines` are the
 * exact text the agent (or the CLI's commit-suggestions path) would write
 * into the file in place of lines [startLine..endLine].
 */
export interface SuggestionBlock {
  /** 1-indexed inclusive start line. Equal to `endLine` for single-line suggestions. */
  startLine: number;
  /** 1-indexed inclusive end line. */
  endLine: number;
  /**
   * Replacement lines verbatim — the exact text that would be spliced in for
   * lines [startLine..endLine]. Lossless: empty array means "delete these
   * lines", `[""]` means "replace with a single blank line", and a trailing
   * `""` means "replacement keeps a trailing blank line". To display as a
   * single string, callers should `lines.join("\n")` themselves.
   */
  lines: readonly string[];
  /** Reviewer login, surfaced so callers can co-credit them in commits. */
  author: string;
}

export interface PrComment {
  id: string;
  isMinimized: boolean;
  author: string;
  body: string;
  url: string;
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
  /** APPROVED reviews that are not minimized — opt-in minimize target for the monitor loop. */
  approvedReviews: Review[];
  checks: CheckRun[];
}
