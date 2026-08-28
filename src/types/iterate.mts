import type {
  AgentThread,
  AgentComment,
  AgentCheck,
  GlobalOptions,
  RelevantCheck,
  ShepherdStatus,
  FirstLookThread,
  FirstLookComment,
} from "./report.mts";
import type { ActiveCheck, PrActivitySummary } from "./activity.mts";
import type {
  BranchProtection,
  MergeStateStatus,
  Review,
  ReviewDecision,
  ReviewThread,
  ShepherdMergeStatus,
} from "./github.mts";
import type { MergeRequirements } from "./merge-requirements.mts";
import type { EscalateDetails } from "./escalate.mts";
import type { MergeCommandPlan } from "./merge-action.mts";
import type { ProtectedRun } from "./protected-run.mts";

export type ShepherdAction = "wait" | "fix_code" | "mark_ready" | "merge" | "cancel" | "escalate";

export interface IterateResultSummary {
  passing: number;
  skipped: number;
  filtered: number;
  inProgress: number;
  superseded: number;
}

export interface IterateResultBase {
  pr: number;
  repo: string;
  status: ShepherdStatus;
  state: "OPEN" | "CLOSED" | "MERGED" | "UNKNOWN";
  mergeStateStatus: MergeStateStatus;
  // Shepherd-derived merge classification (from deriveMergeStatus). Use this (not raw
  // mergeStateStatus) to gate on "is this PR merge-blocked?": collapses BLOCKED+HAS_HOOKS
  // into "BLOCKED" and accounts for blockingBotReviewInProgress/isDraft overrides.
  mergeStatus: ShepherdMergeStatus;
  reviewDecision: ReviewDecision;
  blockingBotReviewInProgress: boolean;
  isDraft: boolean;
  shouldCancel: boolean;
  remainingSeconds: number;
  summary: IterateResultSummary;
  /** Validated base branch (e.g. "main") for this PR. */
  baseBranch: string;
  /** Null when no classic protection rule exists or the base ref is unavailable. */
  branchProtection: BranchProtection | null;
  mergeRequirements?: MergeRequirements;
  /**
   * PR-event checks that completed and are not skipped/neutral.
   * Failing entries carry `workflowName`, `jobName`, `failedStep`, and `summary`.
   */
  checks: RelevantCheck[];
  inProgressChecks?: ActiveCheck[];
  ignoredNames?: string[]; // Suppressed by ignoreChecks config; omitted when empty.
  supersededNames?: string[]; // CANCELLED, superseded by a newer same-workflow run; omitted when empty.
  activity?: PrActivitySummary;
  mergeQueue?: import("./merge-queue.mts").MergeQueueReport;
}

interface IterateResultWait extends IterateResultBase {
  action: "wait";
  log: string;
}

export type CancelReason = "merged" | "closed" | "ready-delay-elapsed";

interface IterateResultCancel extends IterateResultBase {
  action: "cancel";
  reason: CancelReason;
  log: string;
}

export interface ResolveCommand {
  /** Argv for spawn-style execution. May contain a `$DISMISS_MESSAGE` placeholder. `$HEAD_SHA` is never in `argv` — `renderResolveCommand` (from `commands/iterate/render.mts`) appends `--require-sha "$HEAD_SHA"` when rendering if `requiresHeadSha` is true. Use `renderResolveCommand` to render as a command string; don't naive-join. */
  argv: string[];
  /** When true, `renderResolveCommand` appends `--require-sha "$HEAD_SHA"` to the rendered command. */
  requiresHeadSha: boolean;
  /** Whether the model must substitute $DISMISS_MESSAGE with a specific description of the fix. */
  requiresDismissMessage: boolean;
  /** Thread IDs that should receive a reply. Viewer-authored human IDs may also appear in resolveThreadIds. */
  replyThreadIds?: string[];
  /** Thread IDs that should be resolved on GitHub. Human IDs are allowed only for authenticated-viewer reply+resolve pairs or marker-ended retries. */
  resolveThreadIds?: string[];
  /** Bot/non-human CHANGES_REQUESTED review IDs to dismiss. Human-authored IDs must not appear here. */
  dismissReviewIds?: string[];
  /** True when any mutation flag was appended (threads/comments/reviews). False for a bare runner-specific `pr-shepherd apply review <PR>` with nothing to do. Callers use this to gate emitting an apply instruction — coupling to argv length would break silently if the base argv ever grew a global flag. */
  hasMutations: boolean;
}

/**
 * Default fix_code variant: agent applies edits locally, commits when needed,
 * then runs the pre-built apply command. Emitted under `## Post-fix actions`.
 */
interface FixRebaseAndPush {
  threads: AgentThread[];
  /** Unresolved threads that should be resolved on GitHub without requiring code edits. */
  resolutionOnlyThreads: ReviewThread[];
  /** PR comment bodies surfaced to the agent for evaluation, including previously filtered bot/noise comments; do not treat `actionableComments.length` as a proxy for "must push code". */
  actionableComments: AgentComment[];
  /** Review IDs (COMMENTED summaries and, if opted in, APPROVED reviews) to minimize — no code change needed. */
  reviewSummaryIds: string[];
  /** COMMENTED review summaries surfaced to the agent for the first time this iteration — body shown inline. */
  firstLookSummaries: Review[];
  /** COMMENTED review summaries whose body changed since the agent first saw them. Body shown inline; IDs not in `reviewSummaryIds`. */
  editedSummaries: Review[];
  /** APPROVED-state reviews surfaced for visibility (when `iterate.minimizeApprovals` is false). */
  surfacedApprovals: Review[];
  checks: AgentCheck[];
  changesRequestedReviews: Review[];
  /** Pre-built apply command. Run after committing and pushing. */
  resolveCommand: ResolveCommand;
  /** When present, run this command first (no SHA substitution needed) for standalone thread resolves and comment minimization, independent of any push. */
  resolveOnlyCommand?: ResolveCommand;
  /** Ordered steps for the model to follow. */
  instructions: string[];
  /** Reserved compatibility field. Always empty because Shepherd cannot verify workflow-cancellation authorization. */
  inProgressRunIds: string[];
  /** Reserved compatibility field. Always empty because Shepherd never recommends workflow cancellation. */
  protectedRuns: ProtectedRun[];
  /** Requeue command emitted after merge-group remediation. */
  requeue?: MergeCommandPlan;
  /** First-look threads — previously hidden, surfaced for acknowledgment only. */
  firstLookThreads: FirstLookThread[];
  /** First-look comments — previously hidden, surfaced for acknowledgment only. */
  firstLookComments: FirstLookComment[];
}

export interface IterateResultFixCode extends IterateResultBase {
  action: "fix_code";
  fix: FixRebaseAndPush;
  cancelled: string[];
}

interface IterateResultMarkReady extends IterateResultBase {
  action: "mark_ready";
  markedReady: boolean;
  log: string;
}

export interface IterateResultMerge extends IterateResultBase {
  action: "merge";
  merge: MergeCommandPlan;
}

interface IterateResultEscalate extends IterateResultBase {
  action: "escalate";
  escalate: EscalateDetails;
}

export type IterateResult =
  | IterateResultWait
  | IterateResultCancel
  | IterateResultFixCode
  | IterateResultMarkReady
  | IterateResultMerge
  | IterateResultEscalate;

export interface IterateCommandOptions extends GlobalOptions {
  readyDelaySeconds?: number;
  noAutoMarkReady?: boolean;
  /** Legacy no-op retained for API compatibility; workflow runs are never cancelled. */
  noAutoCancelActionable?: boolean;
  /** Override stall timeout seconds. Defaults to config.iterate.stallTimeoutMinutes * 60. */
  stallTimeoutSeconds?: number;
  /** Legacy per-invocation no-op retained for API compatibility. */
  neverCancelRuns?: string[];
  persistSeen?: boolean; // false skips seen-marker writes (poll discarded ticks)
  /** Shepherd through readiness and emit the exact merge/queue command when ready. */
  merge?: boolean;
}
