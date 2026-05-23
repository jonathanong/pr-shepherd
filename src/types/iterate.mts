// Iterate command types.

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
import type {
  BranchProtection,
  CheckStatus,
  MergeStateStatus,
  Review,
  ReviewDecision,
  ReviewThread,
  ShepherdMergeStatus,
} from "./github.mts";

export type ShepherdAction = "wait" | "fix_code" | "mark_ready" | "cancel" | "escalate";

export type EscalateTrigger =
  | "fix-thrash"
  | "base-branch-unknown"
  | "stall-timeout"
  | "thread-missing-location";

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
  /** Pending/unstarted CI checks that exceeded the stall timeout. */
  stalledChecks?: AgentStalledCheck[];
  /** Populated when fix-thrash triggered — threads that have been attempted too many times. */
  thrashHistory?: Array<{ threadId: string; attempts: number }>;
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
  state: "OPEN" | "CLOSED" | "MERGED" | "UNKNOWN";
  mergeStateStatus: MergeStateStatus;
  /**
   * Shepherd-derived merge classification (from deriveMergeStatus). Use this
   * (not raw mergeStateStatus) when gating on "is this PR merge-blocked?":
   * it collapses BLOCKED+HAS_HOOKS into "BLOCKED" and accounts for
   * blockingBotReviewInProgress and isDraft overrides.
   *
   * TODO(C2): Consider removing this field in favour of always using `mergeStateStatus`
   * (the raw GitHub value). `mergeStateStatus` is more useful for agents since it
   * distinguishes BLOCKED from HAS_HOOKS. Blocked by the large surface area of tests
   * and formatters that currently branch on `mergeStatus`.
   */
  mergeStatus: ShepherdMergeStatus;
  reviewDecision: ReviewDecision;
  blockingBotReviewInProgress: boolean;
  isDraft: boolean;
  shouldCancel: boolean;
  remainingSeconds: number;
  summary: IterateResultSummary;
  /** Validated base branch (e.g. "main") for this PR. */
  baseBranch: string;
  /** Branch protection rule for the PR's base branch. Null when no rule exists or the base ref is unavailable. */
  branchProtection: BranchProtection | null;
  /**
   * All CI checks that are relevant to PR readiness: triggered by a PR event
   * (pull_request / pull_request_target, or StatusContext with null event),
   * completed (status === COMPLETED), and not skipped/neutral.
   *
   * Includes both passing and failing checks. Failing entries carry
   * `workflowName`, `jobName`, `failedStep`, and `summary`.
   */
  checks: RelevantCheck[];
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
  /** Thread IDs that should receive a reply instead of a resolve mutation. */
  replyThreadIds?: string[];
  /** True when any mutation flag was appended (threads/comments/reviews). False for a bare runner-specific `pr-shepherd resolve <PR>` with nothing to do. Callers use this to gate emitting a "run the resolve command" instruction — coupling to argv length would break silently if the base argv ever grew a global flag. */
  hasMutations: boolean;
}

/**
 * Default fix_code variant: agent applies edits locally, commits, pushes,
 * then runs the pre-built resolve command. Emitted under `## Post-fix push`.
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
  /**
   * COMMENTED review summaries whose body changed since the agent first saw them.
   * Body shown inline; IDs are NOT included in `reviewSummaryIds` / `--minimize-comment-ids`.
   */
  editedSummaries: Review[];
  /** APPROVED-state reviews surfaced for visibility (when `iterate.minimizeApprovals` is false). */
  surfacedApprovals: Review[];
  checks: AgentCheck[];
  changesRequestedReviews: Review[];
  /** Pre-built resolve command. Run after committing and pushing. */
  resolveCommand: ResolveCommand;
  /** Ordered steps for the model to follow. */
  instructions: string[];
  /** Run IDs of in-progress GitHub Actions checks. The agent should cancel these before pushing new commits; if it decides not to push (e.g. resolve-only), it may skip cancellation. Empty when all in-progress runs are external status checks or already cancelled. */
  inProgressRunIds: string[];
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

interface IterateResultEscalate extends IterateResultBase {
  action: "escalate";
  escalate: EscalateDetails;
}

export type IterateResult =
  | IterateResultWait
  | IterateResultCancel
  | IterateResultFixCode
  | IterateResultMarkReady
  | IterateResultEscalate;

export interface IterateCommandOptions extends GlobalOptions {
  readyDelaySeconds?: number;
  noAutoMarkReady?: boolean;
  noAutoCancelActionable?: boolean;
  /** Override the stall-timeout threshold (seconds). Defaults to config.iterate.stallTimeoutMinutes * 60. */
  stallTimeoutSeconds?: number;
}
