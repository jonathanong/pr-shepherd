import type {
  ClassifiedCheck,
  AuthorType,
  TriagedCheck,
  ReviewThread,
  PrComment,
  Review,
  MergeStatusResult,
  CheckConclusion,
  SuggestionBlock,
} from "./github.mts";
import type { AgentThreadComment } from "./agent-thread.mts";
import type { CheckAnnotation } from "./check-annotations.mts";
import type { PrActivitySummary } from "./activity.mts";

export interface FirstLookThread extends ReviewThread {
  firstLookStatus: "outdated" | "resolved" | "minimized";
  autoResolved?: boolean;
  edited?: boolean;
}

export interface FirstLookComment extends PrComment {
  firstLookStatus: "minimized";
  edited?: boolean;
}

export type ActionableComment = PrComment & { edited?: boolean };

export type ShepherdStatus =
  | "MERGED"
  | "CLOSED"
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
    /** Names of checks suppressed by the user's ignoreChecks config. */
    ignoredNames: string[];
  };
  threads: {
    actionable: ReviewThread[];
    /** Unresolved threads that need a GitHub resolve mutation but do not require code edits. */
    resolutionOnly: ReviewThread[];
    autoResolved: ReviewThread[];
    autoResolveErrors: string[];
    /** First-look items — outdated/resolved/minimized threads not yet seen by the agent. */
    firstLook: FirstLookThread[];
    /** Thread IDs matched by user classification rules with autoResolve:true — routed to resolveThreadIds. */
    ruleAutoResolveIds?: string[];
  };
  comments: {
    actionable: ActionableComment[];
    /** Visible PR comments that should be passed to `--minimize-comment-ids`. */
    minimizeIds?: string[];
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
  /** COMMENTED review summary IDs matched by user rules with autoResolve:true — minimized without surfacing to agent. */
  ruleAutoResolveReviewSummaryIds?: string[];
  /** Branch protection rule for the PR's base branch. Null when no rule exists or the base ref is unavailable. */
  branchProtection: import("./github.mts").BranchProtection | null;
  activity?: PrActivitySummary;
}

export interface ResolveOptions {
  resolveThreadIds?: string[];
  replyThreadIds?: string[];
  minimizeCommentIds?: string[];
  dismissReviewIds?: string[];
  dismissMessage?: string;
  /** When set, shepherd verifies GitHub has received this commit before resolving. */
  requireSha?: string;
}

export interface AgentThread {
  id: string;
  reviewId?: string;
  path: string | null;
  line: number | null;
  startLine?: number; // multi-line range only; omitted when equal to line
  author: string;
  authorType?: AuthorType;
  body: string;
  url: string;
  comments?: AgentThreadComment[];
  suggestion?: SuggestionBlock; // present when body contains a ```suggestion fence
  edited?: boolean;
}

/** Comment shape emitted to the iterate agent — stripped of always-false flags. */
export interface AgentComment {
  id: string;
  author: string;
  authorType?: AuthorType;
  body: string;
  url: string;
  edited?: boolean;
}

/** Check shape emitted to the iterate agent under `fix_code`. Cancelled checks
 * should be handled from `name`/`runId`/`detailsUrl`/`conclusion`; optional
 * workflow/job/step metadata may still be present when available. */
export interface AgentCheck {
  name: string;
  runId: string | null;
  /** Fallback for checks where runId is null (e.g. external status checks). */
  detailsUrl: string | null;
  /** Raw GitHub check conclusion; may be null for some completed checks from upstream data. */
  conclusion: Exclude<CheckConclusion, "SKIPPED" | "NEUTRAL">;
  /** Workflow display name (e.g. `"CI"`). Populated on a best-effort basis when available from the jobs API. */
  workflowName?: string;
  /** Name of the matched job (e.g. `"tests (ubuntu)"`). Distinct from check name for matrix builds. */
  jobName?: string;
  /** Name of the first failed step (e.g. `"Run tests"`, `"Set up job"`). */
  failedStep?: string;
  /** One-line status text shown in the GitHub UI (e.g. "67.68% of diff hit (target 85.00%)"). */
  summary?: string;
  /** Marker-gated inline annotations from this failing check. */
  annotations?: CheckAnnotation[];
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
  /** Marker-gated inline annotations from this check. */
  annotations?: CheckAnnotation[];
}

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
export interface GlobalOptions {
  prNumber?: number;
  format: "text" | "json";
  verbose?: boolean;
}
