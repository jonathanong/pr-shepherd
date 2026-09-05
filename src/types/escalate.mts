import type { AgentCheck, AgentComment, AgentThread } from "./report.mts";
import type { CheckStatus, Review } from "./github.mts";
import type { MergeQueueRemovalStatus, StackStatus } from "./merge-requirements.mts";

export type EscalateTrigger =
  | "fix-thrash"
  | "base-branch-unknown"
  | "stall-timeout"
  | "check-follow-up-unavailable"
  | "authorization-required"
  | "bot-cr-not-dismissed"
  | "merge-queue-removed"
  | "stacked-pr";

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
}

export interface EscalateDetails {
  triggers: EscalateTrigger[];
  unresolvedThreads: AgentThread[];
  ambiguousComments: AgentComment[];
  changesRequestedReviews: Review[];
  /** Failing checks whose next step requires human attention. */
  checks?: AgentCheck[];
  stalledChecks?: AgentStalledCheck[];
  thrashHistory?: Array<{ threadId: string; attempts: number }>;
  suggestion: string;
  humanMessage: string;
  mergeQueueRemoval?: MergeQueueRemovalStatus;
  stack?: StackStatus;
  authorization?: Array<{
    action: "mark-ready" | "merge-or-enqueue";
    targetIds: string[];
    reason: "denied-or-unverifiable";
  }>;
}
