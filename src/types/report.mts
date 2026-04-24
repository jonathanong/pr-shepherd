// Shepherd-specific report types, agent projections, and CLI options.

import type {
  ClassifiedCheck,
  TriagedCheck,
  ReviewThread,
  PrComment,
  Review,
  MergeStatusResult,
  FailureKind,
  CheckConclusion,
} from "./github.mts";

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
  /** COMMENTED reviews with a non-empty, non-minimized body — surfaced for agent-driven minimize. */
  reviewSummaries: Review[];
  /** APPROVED reviews not yet minimized — opt-in minimize target. */
  approvedReviews: Review[];
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
 * Check shape emitted to the monitor agent.
 * The agent fetches failed job logs on demand via `gh run view <runId> --log-failed`
 * when `runId` is available, and falls back to `detailsUrl` otherwise.
 */
export interface AgentCheck {
  name: string;
  runId: string | null;
  /** Fallback for checks where runId is null (e.g. external status checks). */
  detailsUrl: string | null;
  failureKind?: FailureKind;
  /** Workflow display name (e.g. `"CI"`). Populated on a best-effort basis when available from the jobs API. */
  workflowName?: string;
  /** For `actionable` failures: name of the first failed step (e.g. `"Run tests"`, `"Set up job"`). */
  failedStep?: string;
}

// ---------------------------------------------------------------------------
// Relevant check (iterate output — completed, non-skipped, PR-triggered)
// ---------------------------------------------------------------------------

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
  /** Present for non-SUCCESS conclusions. */
  failureKind?: FailureKind;
  /** Workflow display name (e.g. `"CI"`). Available for all checks with a runId. */
  workflowName?: string;
  /** For `actionable` failures: name of the first failed step in the matched job. */
  failedStep?: string;
}

// ---------------------------------------------------------------------------
// commit-suggestion command (singular — one suggestion, one local commit)
// ---------------------------------------------------------------------------

interface CommitSuggestionResultBase {
  pr: number;
  repo: string;
  threadId: string;
  path: string;
  startLine: number;
  endLine: number;
  author: string;
  /** The unified diff that was generated for this suggestion. */
  patch: string;
  postActionInstruction: string;
}

export type CommitSuggestionResult =
  | (CommitSuggestionResultBase & {
      applied: true;
      dryRun?: false;
      commitSha: string;
    })
  | (CommitSuggestionResultBase & {
      applied: false;
      dryRun?: false;
      reason: string;
    })
  | (CommitSuggestionResultBase & {
      applied: false;
      dryRun: true;
      /** Whether `git apply --check` succeeded. */
      valid: boolean;
      /** Rejection message from `git apply --check`, or null when valid. */
      reason: string | null;
    });

// ---------------------------------------------------------------------------
// CLI options
// ---------------------------------------------------------------------------

export interface GlobalOptions {
  prNumber?: number;
  format: "text" | "json";
  noCache: boolean;
  cacheTtlSeconds: number;
}
