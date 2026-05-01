import type {
  ClassifiedCheck,
  TriagedCheck,
  ReviewThread,
  PrComment,
  Review,
  MergeStatusResult,
  CheckConclusion,
  SuggestionBlock,
} from "./github.mts";

// ---------------------------------------------------------------------------
// First-look items (previously hidden — surfaced to agent on first encounter)
// ---------------------------------------------------------------------------

export interface FirstLookThread extends ReviewThread {
  firstLookStatus: "outdated" | "resolved" | "minimized";
  /** True when Shepherd auto-resolved this thread during the current run (outdated only). */
  autoResolved?: boolean;
  /** True when the body was edited by the author after first acknowledgement. */
  edited?: boolean;
}

export interface FirstLookComment extends PrComment {
  firstLookStatus: "minimized";
  /** True when the body was edited by the author after first acknowledgement. */
  edited?: boolean;
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
    /** First-look items — outdated/resolved/minimized threads not yet seen by the agent. */
    firstLook: FirstLookThread[];
  };
  comments: {
    actionable: PrComment[];
    /** First-look items — minimized comments not yet seen by the agent. */
    firstLook: FirstLookComment[];
  };
  changesRequestedReviews: Review[];
  /** COMMENTED reviews already seen — eligible for `--minimize-comment-ids` without re-rendering. */
  reviewSummaries: Review[];
  /** COMMENTED reviews not yet seen — body must be surfaced before minimizing. */
  firstLookSummaries: Review[];
  /** COMMENTED reviews whose body changed since last seen — surface updated body, but do NOT re-add to `--minimize-comment-ids`. */
  editedSummaries: Review[];
  /** APPROVED reviews not yet minimized — opt-in minimize target. */
  approvedReviews: Review[];
}

export interface ResolveOptions {
  resolveThreadIds?: string[];
  minimizeCommentIds?: string[];
  dismissReviewIds?: string[];
  dismissMessage?: string;
  /** When set, shepherd verifies GitHub has received this commit before resolving. */
  requireSha?: string;
}

/** Thread shape emitted to the monitor agent — stripped of always-false flags. */
export interface AgentThread {
  id: string;
  path: string | null;
  line: number | null;
  startLine?: number; // multi-line range only; omitted when equal to line
  author: string;
  body: string;
  url: string;
  suggestion?: SuggestionBlock; // present when body contains a ```suggestion fence
}

/** Comment shape emitted to the monitor agent — stripped of always-false flags. */
export interface AgentComment {
  id: string;
  author: string;
  body: string;
  url: string;
}

/**
 * Check shape emitted to the monitor agent under `fix_code`.
 * Includes log tail so the agent can diagnose failures without a separate tool call.
 */
export interface AgentCheck {
  name: string;
  runId: string | null;
  /** Fallback for checks where runId is null (e.g. external status checks). */
  detailsUrl: string | null;
  /** Workflow display name (e.g. `"CI"`). Populated on a best-effort basis when available from the jobs API. */
  workflowName?: string;
  /** Name of the matched job (e.g. `"tests (ubuntu)"`). Distinct from check name for matrix builds. */
  jobName?: string;
  /** Name of the first failed step (e.g. `"Run tests"`, `"Set up job"`). */
  failedStep?: string;
  /** One-line status text shown in the GitHub UI (e.g. "67.68% of diff hit (target 85.00%)"). */
  summary?: string;
  /** Last N lines of the failing job's log. `undefined` for external checks or when log fetch fails. */
  logTail?: string;
}

/**
 * A single CI check that is relevant to PR readiness — triggered by a PR event
 * (or by a StatusContext with null event), completed, and not skipped/neutral.
 *
 * Included in every iterate result so the agent always sees the full CI picture
 * regardless of which action fired.
 */
export interface RelevantCheck {
  name: string;
  conclusion: Exclude<CheckConclusion, "SKIPPED" | "NEUTRAL" | null>;
  runId: string | null;
  detailsUrl: string | null;
  /** Workflow display name (e.g. `"CI"`). Available for all checks with a runId. */
  workflowName?: string;
  /** Name of the matched job (e.g. `"tests (ubuntu)"`). Distinct from check name for matrix builds. */
  jobName?: string;
  /** Name of the first failed step in the matched job. */
  failedStep?: string;
  /** One-line status text shown in the GitHub UI (e.g. "67.68% of diff hit (target 85.00%)"). */
  summary?: string;
}

// ---------------------------------------------------------------------------
// commit-suggestion command (singular — produces a suggestion for the agent to apply)
// ---------------------------------------------------------------------------

export interface CommitSuggestionResult {
  pr: number;
  repo: string;
  threadId: string;
  path: string;
  startLine: number;
  endLine: number;
  author: string;
  /** The unified diff generated for this suggestion. */
  patch: string;
  /** The commit subject line (user-supplied --message). */
  commitMessage: string;
  /** The commit body (optional description + Co-authored-by trailer). */
  commitBody: string;
  /** Files the agent should stage before committing. */
  filesToStage: string[];
  /** Numbered steps the agent must execute to apply, commit, resolve, and push. */
  postActionInstructions: string[];
}

// CLI options
export interface GlobalOptions {
  prNumber?: number;
  format: "text" | "json";
  verbose?: boolean;
}
