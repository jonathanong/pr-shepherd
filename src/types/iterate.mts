/* eslint-disable max-lines */
import type {
  AgentThread,
  AgentComment,
  AgentCheck,
  GlobalOptions,
  RelevantCheck,
  ShepherdStatus,
  FirstLookThread,
  FirstLookComment,
  EditedComment,
  RuleAutoResolveReport,
} from "./report.mts";
import type { ActiveCheck, PrActivitySummary } from "./activity.mts";
import type {
  BranchProtection,
  MergeStateStatus,
  MergedBasePullRequest,
  Review,
  ReviewDecision,
  ReviewThread,
  ShepherdMergeStatus,
} from "./github.mts";
import type { MergeRequirements } from "./merge-requirements.mts";
import type { EscalateDetails } from "./escalate.mts";
import type { MergeCommandPlan } from "./merge-action.mts";
import type { ApiUsage, GraphqlQuotaWarning } from "./api-usage.mts";
import type { NextCheck } from "./next-check.mts";

export type ShepherdAction =
  | "wait"
  | "ready"
  | "fix_code"
  | "mark_ready"
  | "merge"
  | "cancel"
  | "escalate";

export interface IterateResultSummary {
  passing: number;
  skipped: number;
  filtered: number;
  /** Non-completed checks GitHub reports as `IN_PROGRESS`. */
  inProgress: number;
  /** Non-completed checks GitHub reports as `QUEUED`, `WAITING`, `PENDING`, or `REQUESTED`. */
  queued: number;
  superseded: number;
}

export interface IterateResultBase {
  transport?: "rest";
  transportUnavailable?: Array<{ field: string; reason: string }>;
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
  /**
   * Set when a native-stack upper layer is conflicting but already contains its
   * PR base, so the dirty state is against the stack trunk rather than that base.
   */
  stackTrunkConflict?: string;
  /** Merged PRs whose exact head commit and repository match this conflicting PR's base. */
  mergedBasePullRequests?: MergedBasePullRequest[];
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
  /** Required merge-target contexts with no check run and no status context. Omitted when empty. */
  unreportedRequiredChecks?: string[];
  /** Commits on the stack trunk that the bottom open layer does not contain. Omitted when zero. */
  trunkBehindBy?: number;
  /** Commits on the PR base that this head does not contain. Omitted when zero. */
  baseBehindBy?: number;
  activity?: PrActivitySummary;
  mergeQueue?: import("./merge-queue.mts").MergeQueueReport;
  apiUsage?: ApiUsage;
  quotaWarning?: GraphqlQuotaWarning;
  fingerprintReused?: true;
  /** Single ticks only: when to come back if no GitHub event arrives first. Omitted for `fix_code` and terminal actions. */
  nextCheck?: NextCheck;
  /** Classification-rule resolve/minimize applied during this fetch. Omitted when nothing happened. */
  ruleAutoResolve?: RuleAutoResolveReport;
  /**
   * PR comments edited since Shepherd last showed them. Edits never block readiness, so they are
   * held during `wait`/`ready` and shown once on the next other action. Omitted when empty.
   */
  editedComments?: EditedComment[];
}

interface IterateResultWait extends IterateResultBase {
  action: "wait";
  log: string;
  deferredWork?: import("./merge-queue.mts").IterateDeferredWork;
}

/** Clean PR whose ready-delay is still counting. `--until-terminal` returns this instead of sleeping. */
interface IterateResultReady extends IterateResultBase {
  action: "ready";
  log: string;
}

export type CancelReason = "merged" | "closed" | "ready-delay-elapsed" | "auto-mark-ready-disabled";

interface IterateResultCancel extends IterateResultBase {
  action: "cancel";
  reason: CancelReason;
  log: string;
}

export interface ResolveCommand {
  /** Argv for spawn-style execution. May contain a `$DISMISS_MESSAGE` placeholder. `--require-sha` is never in `argv` — `renderResolveCommand` (from `commands/iterate/render.mts`) appends `--require-sha HEAD` when rendering if `requiresHeadSha` is true. Use `renderResolveCommand` to render as a command string; don't naive-join. */
  argv: string[];
  /** When true, `renderResolveCommand` appends `--require-sha HEAD` to the rendered command. */
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
  /** Requeue command emitted after merge-group remediation. */
  requeue?: MergeCommandPlan;
  /** Acknowledge an unrelated native-stack queue failure before fresh READY validation. */
  queueRemovalAcknowledgment?: { argv: string[] };
  /** First-look threads — previously hidden, surfaced for acknowledgment only. */
  firstLookThreads: FirstLookThread[];
  /** First-look comments — previously hidden, surfaced for acknowledgment only. */
  firstLookComments: FirstLookComment[];
  /** Set only when `iterate.reviewOutputMaxChars` held review items back: `shown` of `total`. */
  reviewItems?: { shown: number; total: number };
}

export interface IterateResultFixCode extends IterateResultBase {
  action: "fix_code";
  fix: FixRebaseAndPush;
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
  | IterateResultReady
  | IterateResultCancel
  | IterateResultFixCode
  | IterateResultMarkReady
  | IterateResultMerge
  | IterateResultEscalate;

export interface IterateCommandOptions extends GlobalOptions {
  readyDelaySeconds?: number;
  noAutoMarkReady?: boolean;
  stallTimeoutSeconds?: number;
  /**
   * Internal. `false` skips seen-marker writes (poll's discarded debounce ticks). Set
   * only by `runPollCore`; excluded from the public `IterateInput` in api.mts.
   */
  persistSeen?: boolean;
  /**
   * Internal. `true` attaches edited comments without writing their markers; the poll loop
   * writes them for the one result it returns. Set only by `runPollCore`.
   */
  deferEditedCommentMarkers?: boolean;
  /**
   * Internal. `true` allows fingerprint reuse of a previous WAIT-shaped report.
   * Poll sets this only for internal WAIT/MARK_READY continuation ticks — never the
   * tick returned to the caller, never FIX_CODE debounce, never single-tick iterate.
   * Writes still happen after a full fetch so the next poll can skip. Excluded from
   * the public `IterateInput` in api.mts.
   */
  fingerprintCache?: boolean;
  /**
   * Internal. A single tick passes a sink that receives the CI-start stall deadline (oldest
   * unstarted check age + stall timeout) so `nextCheck` can wake before it. Excluded from
   * the public `IterateInput` in api.mts.
   */
  stallDeadlineSink?: { ciStartDeadlineSeconds?: number };
  /** Shepherd through readiness and emit the exact merge/queue command when ready. */
  merge?: boolean;
  /** Override `iterate.instructions` for this call. */
  instructions?: import("../config/load.mts").InstructionStyle;
  /**
   * Internal. Defers quota warnings until an until-terminal poll breaks. Set only by
   * `runPollCore`; excluded from the public `IterateInput` in api.mts.
   */
  deferQuotaWarning?: boolean;
  quotaWarningMinimumPollIntervalMinutes?: number;
}
