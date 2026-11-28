import type { AgentCheck, AgentComment, AgentThread } from "./report.mts";
import type { ResolveCommand } from "./iterate.mts";
import type { CheckStatus, PendingDeployment, Review } from "./github.mts";
import type { MergeQueueRemovalStatus } from "./merge-requirements.mts";

export type EscalateTrigger =
  | "transport-unsupported"
  | "triage-thrash"
  | "stall-timeout"
  | "required-checks-unreported"
  | "stall-state-unavailable"
  | "check-follow-up-unavailable"
  | "authorization-required"
  | "merge-queue-removed"
  | "merge-method-unavailable"
  | "unowned-stack-layers"
  | "unapproved-stack-layer"
  | "merge-through-target-closed"
  | "listed-pr-left-stack";

/**
 * Reasons an aggregate `stack`/PR-set row reports `escalate`. They ride on the row's `reasons`,
 * not on an iterate result's `escalate.triggers`, so they are not `EscalateTrigger` members.
 * Row hand-offs that are triggers (`transport-unsupported`) are listed there.
 */
export type StackHandoffReason =
  | "closed-unmerged-dependency"
  | "closed-unmerged-layer"
  | "mark-ready-authorization-required";

export interface AgentStalledCheck {
  name: string;
  status: CheckStatus;
  source: "check_run" | "status_context" | "startup_failure";
  runId: string | null;
  detailsUrl: string | null;
  createdAtUnix?: number;
  startedAtUnix?: number;
  updatedAtUnix?: number;
  ageSeconds: number;
  summary?: string;
  pendingDeployments?: PendingDeployment[];
}

export interface EscalateDetails {
  triggers: EscalateTrigger[];
  unresolvedThreads: AgentThread[];
  ambiguousComments: AgentComment[];
  changesRequestedReviews: Review[];
  /** First-look review summaries that must be shown before any pending minimization. */
  firstLookSummaries?: Review[];
  /** Previously seen review summaries whose edited bodies must be shown again. */
  editedSummaries?: Review[];
  /** Failing checks whose next step requires human attention. */
  checks?: AgentCheck[];
  stalledChecks?: AgentStalledCheck[];
  thrashHistory?: Array<{ threadId: string; attempts: number }>;
  /**
   * Set only when `iterate.review-output-max-chars` held review items back on the tick that
   * escalated: `shown` of `total` review items appear here. The held items stay unmarked, so the
   * next run shows them.
   */
  reviewItems?: { shown: number; total: number };
  /** Review mutations generated for this tick, retained so an escalation cannot strand them. */
  pendingReviewCommands?: {
    resolveOnlyCommand?: ResolveCommand;
    resolveCommand?: ResolveCommand;
    dismissReviewsCommand?: ResolveCommand;
  };
  suggestion: string;
  humanMessage: string;
  mergeQueueRemoval?: MergeQueueRemovalStatus;
  authorization?: Array<{
    action: "mark-ready" | "merge-or-enqueue";
    targetIds: string[];
    reason: "denied-or-unverifiable";
  }>;
}
