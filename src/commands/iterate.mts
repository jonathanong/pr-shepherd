/**
 * `shepherd iterate [PR]`
 *
 * One-shot iteration that rolls cooldown + sweep + deterministic dispatch
 * into a single call, emitting compact JSON.
 *
 * Decision order:
 *   1. cooldown   — last commit is < cooldownSeconds old
 *   2. sweep      — fetch CI + comments + merge status, auto-resolve outdated
 *   2.5 cancel    — state !== OPEN (PR merged or closed)
 *   3. cancel     — readyState.shouldCancel
 *   4. fix_code   — actionable threads, comments, CI failures, CHANGES_REQUESTED, or CONFLICTS
 *                   (fix_code handler does fetch+rebase+push — all actionable work in one push)
 *   5. rerun_ci   — timeout / infrastructure failures only (no actionable work, no conflicts)
 *   6. rebase     — flaky failure + branch BEHIND
 *   7. mark_ready — READY + CLEAN + draft + not shouldCancel (converts draft to ready)
 *   8. wait       — nothing to do
 *
 * Exit codes:
 *   0  wait / cooldown / rerun_ci / mark_ready
 *   1  fix_code / rebase
 *   2  cancel
 */

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { runCheck } from "./check.mts";
import { triageFailingChecks } from "../checks/triage.mts";
import { updateReadyDelay } from "./ready-delay.mts";
import { getCurrentPrNumber } from "../github/client.mts";
import { rest, graphql } from "../github/http.mts";
import { MARK_PR_READY_MUTATION } from "../github/queries.mts";
import { readFixAttempts, writeFixAttempts } from "../cache/fix-attempts.mts";
import { readStallState, writeStallState } from "../cache/iterate-stall.mts";
import { toAgentThread, toAgentComment, toAgentChecks } from "../reporters/agent.mts";
import type {
  AgentComment,
  AgentThread,
  EscalateDetails,
  IterateCommandOptions,
  IterateResult,
  IterateResultBase,
  IterateResultSummary,
  PrComment,
  ResolveCommand,
  Review,
  ReviewThread,
  TriagedCheck,
} from "../types.mts";
import { loadConfig } from "../config/load.mts";

const execFile = promisify(execFileCb);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function runIterate(opts: IterateCommandOptions): Promise<IterateResult> {
  const config = loadConfig();
  const cooldownSeconds = opts.cooldownSeconds ?? config.iterate.cooldownSeconds;
  const readyDelaySeconds = opts.readyDelaySeconds ?? config.watch.readyDelayMinutes * 60;
  const stallTimeoutSeconds = opts.stallTimeoutSeconds ?? config.iterate.stallTimeoutMinutes * 60;

  // Resolve prNumber early so the cooldown result carries a valid PR number.
  const prNumber = opts.prNumber ?? (await getCurrentPrNumber());
  if (prNumber === null) {
    throw new Error("No open PR found for current branch. Pass a PR number explicitly.");
  }
  const optsWithPr = { ...opts, prNumber };

  // Step 1: Cooldown — skip if last commit is too fresh.
  const lastCommitTime = await getLastCommitTime();
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds - lastCommitTime < cooldownSeconds) {
    // We don't have a report yet — return a minimal cooldown result.
    return {
      action: "cooldown",
      pr: prNumber,
      repo: "",
      status: "UNKNOWN",
      state: "UNKNOWN" as const,
      mergeStateStatus: "UNKNOWN",
      copilotReviewInProgress: false,
      isDraft: false,
      shouldCancel: false,
      remainingSeconds: readyDelaySeconds,
      summary: { passing: 0, skipped: 0, filtered: 0, inProgress: 0 },
      baseBranch: "",
      log: "SKIP: CI still starting — waiting for first check to appear",
    };
  }

  // Step 2: Sweep — fetch CI + comments + merge status, auto-resolve outdated.
  // skipTriage defers log fetching until we know we'll need failureKind (steps 4–6).
  let report = await runCheck({
    ...optsWithPr,
    autoResolve: config.actions.autoResolveOutdated,
    skipTriage: true,
  });

  // Step 2.5: Cancel if PR is merged or closed — no longer actionable.
  if (report.mergeStatus.state !== "OPEN") {
    const state = report.mergeStatus.state.toLowerCase();
    return {
      pr: report.pr,
      repo: report.repo,
      status: report.status,
      mergeStateStatus: report.mergeStatus.mergeStateStatus,
      copilotReviewInProgress: report.mergeStatus.copilotReviewInProgress,
      isDraft: report.mergeStatus.isDraft,
      shouldCancel: true,
      remainingSeconds: 0,
      state: report.mergeStatus.state,
      summary: buildSummary(report),
      baseBranch: report.baseBranch,
      action: "cancel",
      log: `CANCEL: PR #${report.pr} is ${state} — stopping monitor`,
    };
  }

  // Step 3: Ready-delay state machine.
  const [repoOwner, repoName] = report.repo.split("/");
  if (!repoOwner || !repoName) {
    throw new Error(`Unexpected repo format: "${report.repo}" (expected "owner/name")`);
  }
  const isReady = report.status === "READY";
  const readyState = await updateReadyDelay(
    report.pr,
    isReady,
    readyDelaySeconds,
    repoOwner,
    repoName,
  );

  const base: IterateResultBase = {
    pr: report.pr,
    repo: report.repo,
    status: report.status,
    state: report.mergeStatus.state,
    mergeStateStatus: report.mergeStatus.mergeStateStatus,
    copilotReviewInProgress: report.mergeStatus.copilotReviewInProgress,
    isDraft: report.mergeStatus.isDraft,
    shouldCancel: readyState.shouldCancel,
    remainingSeconds: readyState.remainingSeconds,
    summary: buildSummary(report),
    baseBranch: report.baseBranch,
  };

  // Step 3 cont.: cancel if ready-delay elapsed.
  if (readyState.shouldCancel) {
    return {
      ...base,
      action: "cancel",
      log: `CANCEL: PR #${base.pr} has been ready for review — ready-delay elapsed, stopping monitor`,
    };
  }

  // Fetch HEAD SHA once — used by both fix-attempts tracking and stall-detection fingerprint.
  // Done after the shouldCancel early-return to avoid a subprocess call on cancel paths.
  const headSha = await getCurrentHeadSha();
  const stallKey = { owner: repoOwner, repo: repoName, pr: prNumber };

  // Triage failing checks now that we know we need failureKind for steps 4–6.
  if (report.checks.failing.length > 0) {
    const triaged = await triageFailingChecks(report.checks.failing, {
      owner: repoOwner,
      name: repoName,
    });
    report = { ...report, checks: { ...report.checks, failing: triaged } };
  }

  // Step 4: Actionable work — fix comments, review requests, CI failures, and merge
  // conflicts all in one push. CONFLICTS is included here because the fix_code handler
  // already runs fetch+rebase+push, so conflicts are resolved as part of that flow.
  const actionableChecks = report.checks.failing.filter((f) => f.failureKind === "actionable");
  // Classify review summaries upfront so summary-only PRs still trigger fix_code and get minimized.
  const { minimizeIds: reviewSummaryIds, surfacedSummaries } = classifyReviewSummaries(
    report.reviewSummaries,
    report.approvedReviews,
    config.iterate.minimizeReviewSummaries,
  );
  const hasActionableWork =
    report.threads.actionable.length > 0 ||
    report.comments.actionable.length > 0 ||
    report.changesRequestedReviews.length > 0 ||
    actionableChecks.length > 0 ||
    report.mergeStatus.status === "CONFLICTS" ||
    reviewSummaryIds.length > 0 ||
    surfacedSummaries.length > 0;

  if (hasActionableWork) {
    // Load fix-attempt counts, resetting if HEAD SHA changed (new commit pushed).
    const attemptsKey = { owner: repoOwner, repo: repoName, pr: prNumber };
    const stored = await readFixAttempts(attemptsKey);
    const attempts =
      stored?.headSha === headSha
        ? stored
        : { headSha, threadAttempts: {} as Record<string, number> };

    // Escalation checks — surface ambiguous situations instead of looping forever.
    const escalateTriggers = checkEscalateTriggers(
      report.threads.actionable,
      report.comments.actionable,
      report.changesRequestedReviews,
      actionableChecks,
      attempts.threadAttempts,
      report.mergeStatus.status === "CONFLICTS",
    );
    if (escalateTriggers.triggers.length > 0) {
      const escalateBase: Omit<EscalateDetails, "humanMessage"> = {
        triggers: escalateTriggers.triggers,
        unresolvedThreads: report.threads.actionable.map(toAgentThread),
        ambiguousComments: report.comments.actionable.map(toAgentComment),
        changesRequestedReviews: report.changesRequestedReviews,
        attemptHistory: escalateTriggers.thrashHistory,
        suggestion: buildEscalateSuggestion(escalateTriggers.triggers),
      };
      return {
        ...base,
        action: "escalate",
        escalate: {
          ...escalateBase,
          humanMessage: buildEscalateHumanMessage(escalateBase, prNumber),
        },
      };
    }

    // Increment attempt counts for this dispatch cycle.
    const newThreadAttempts = { ...attempts.threadAttempts };
    for (const t of report.threads.actionable) {
      newThreadAttempts[t.id] = (newThreadAttempts[t.id] ?? 0) + 1;
    }
    await writeFixAttempts(attemptsKey, { headSha, threadAttempts: newThreadAttempts });

    let cancelled: string[] = [];
    if (!opts.noAutoCancelActionable) {
      const uniqueRunIds = [
        ...new Set(actionableChecks.map((c) => c.runId).filter((id): id is string => id !== null)),
      ];
      const results = await Promise.all(
        uniqueRunIds.map((id) => tryCancelRun(id, repoOwner, repoName)),
      );
      cancelled = results.filter((id): id is string => id !== null);
    }

    const baseLookup = validateBaseBranch(report.baseBranch);
    const threads = report.threads.actionable.map(toAgentThread);
    const { actionable: actionableComments, noiseIds: noiseCommentIds } = classifyComments(
      report.comments.actionable.map(toAgentComment),
    );
    const checks = toAgentChecks(actionableChecks);
    const { changesRequestedReviews } = report;
    const hasConflicts = report.mergeStatus.status === "CONFLICTS";

    // Review summary IDs ride in the minimize bucket — they have no code-fix counterpart.
    const allCommentIds = [
      ...actionableComments.map((c) => c.id),
      ...noiseCommentIds,
      ...reviewSummaryIds,
    ];
    const resolveCommand = buildResolveCommand(
      threads,
      actionableComments,
      allCommentIds,
      changesRequestedReviews,
      checks,
      prNumber,
    );

    // Guard: if the emitted flow requires a push (code fixes or conflict
    // resolution rebase) but we could not confirm the PR's base branch, refuse
    // to emit fix_code — a wrong-base rebase would rewrite history onto the
    // wrong target. Escalate for human direction.
    if (baseLookup.isFallback && (resolveCommand.requiresHeadSha || hasConflicts)) {
      const fallbackEscalateBase: Omit<EscalateDetails, "humanMessage"> = {
        triggers: ["base-branch-unknown"],
        unresolvedThreads: threads,
        ambiguousComments: actionableComments,
        changesRequestedReviews,
        suggestion: buildEscalateSuggestion(["base-branch-unknown"], baseLookup.failureReason),
      };
      return {
        ...base,
        action: "escalate",
        escalate: {
          ...fallbackEscalateBase,
          humanMessage: buildEscalateHumanMessage(fallbackEscalateBase, prNumber),
        },
      };
    }

    const instructions = buildFixInstructions(
      threads,
      actionableComments,
      checks,
      changesRequestedReviews,
      baseLookup.branch,
      resolveCommand,
      hasConflicts,
      prNumber,
    );

    return applyStallGuard(
      stallKey,
      stallTimeoutSeconds,
      headSha,
      base,
      prNumber,
      {
        ...base,
        baseBranch: baseLookup.branch,
        action: "fix_code" as const,
        fix: {
          mode: "rebase-and-push" as const,
          threads,
          actionableComments,
          noiseCommentIds,
          reviewSummaryIds,
          surfacedSummaries,
          checks,
          changesRequestedReviews,
          resolveCommand,
          instructions,
        },
        cancelled,
      } as IterateResult,
      report,
      reviewSummaryIds,
    );
  }

  // Step 5: Transient failures (timeout / infrastructure) — no actionable work, no conflicts.
  const transientChecks = report.checks.failing.filter(
    (f) => f.failureKind === "timeout" || f.failureKind === "infrastructure",
  );
  if (transientChecks.length > 0 && !opts.noAutoRerun) {
    // Group checks by runId — multiple failed steps can share one run.
    const runMap = new Map<string, import("../types.mts").ReranRun>();
    for (const c of transientChecks) {
      if (c.runId === null) continue;
      const existing = runMap.get(c.runId);
      if (existing) {
        existing.checkNames.push(c.name);
      } else {
        runMap.set(c.runId, {
          runId: c.runId,
          checkNames: [c.name],
          failureKind: c.failureKind as "timeout" | "infrastructure",
        });
      }
    }
    const reran = [...runMap.values()];
    await Promise.all(
      reran.map(({ runId }) =>
        rest("POST", `/repos/${repoOwner}/${repoName}/actions/runs/${runId}/rerun-failed-jobs`),
      ),
    );
    const runSummaries = reran.map(
      ({ runId, checkNames, failureKind }) =>
        `${runId} (${checkNames.join(", ")} — ${failureKind})`,
    );
    return applyStallGuard(
      stallKey,
      stallTimeoutSeconds,
      headSha,
      base,
      prNumber,
      {
        ...base,
        action: "rerun_ci" as const,
        reran,
        log: `RERAN ${reran.length} CI run${reran.length === 1 ? "" : "s"}: ${runSummaries.join(", ")}`,
      } as IterateResult,
      report,
      reviewSummaryIds,
    );
  }

  // Step 6: Flaky + behind — rebase needed.
  const hasFlaky = report.checks.failing.some((f) => f.failureKind === "flaky");
  if (hasFlaky && report.mergeStatus.status === "BEHIND" && config.actions.autoRebase) {
    const baseLookup = validateBaseBranch(report.baseBranch);
    if (baseLookup.isFallback) {
      const fallbackEscalateBase: Omit<EscalateDetails, "humanMessage"> = {
        triggers: ["base-branch-unknown"],
        unresolvedThreads: [],
        ambiguousComments: [],
        changesRequestedReviews: [],
        suggestion: buildEscalateSuggestion(["base-branch-unknown"], baseLookup.failureReason),
      };
      return {
        ...base,
        action: "escalate",
        escalate: {
          ...fallbackEscalateBase,
          humanMessage: buildEscalateHumanMessage(fallbackEscalateBase, prNumber),
        },
      };
    }
    return applyStallGuard(
      stallKey,
      stallTimeoutSeconds,
      headSha,
      base,
      prNumber,
      {
        ...base,
        baseBranch: baseLookup.branch,
        action: "rebase" as const,
        rebase: {
          reason: `Branch is behind ${baseLookup.branch} — rebasing to pick up latest changes and clear flaky failures`,
          shellScript: buildRebaseShellScript(baseLookup.branch),
        },
      } as IterateResult,
      report,
      reviewSummaryIds,
    );
  }

  // Step 7: Mark ready for review.
  // Draft PRs often report mergeStateStatus === 'DRAFT' rather than 'CLEAN' until
  // they're explicitly marked ready, so we allow either state when isDraft is true.
  const mergeStateAllowsMarkReady =
    report.mergeStatus.mergeStateStatus === "CLEAN" ||
    (report.mergeStatus.mergeStateStatus === "DRAFT" && report.mergeStatus.isDraft);
  const canMarkReady =
    report.status === "READY" &&
    mergeStateAllowsMarkReady &&
    !report.mergeStatus.copilotReviewInProgress &&
    !readyState.shouldCancel &&
    report.mergeStatus.isDraft;

  if (canMarkReady && !opts.noAutoMarkReady && config.actions.autoMarkReady) {
    await graphql(MARK_PR_READY_MUTATION, { pullRequestId: report.nodeId });
    return {
      ...base,
      action: "mark_ready",
      markedReady: true,
      log: `MARKED READY: PR #${report.pr} converted from draft to ready for review`,
    };
  }

  // Step 8: Nothing to do.
  return applyStallGuard(
    stallKey,
    stallTimeoutSeconds,
    headSha,
    base,
    prNumber,
    { ...base, action: "wait" as const, log: buildWaitLog(base) } as IterateResult,
    report,
    reviewSummaryIds,
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSummary(report: Awaited<ReturnType<typeof runCheck>>): IterateResultSummary {
  return {
    passing: report.checks.passing.length,
    skipped: report.checks.skipped.length,
    filtered: report.checks.filtered.length,
    inProgress: report.checks.inProgress.length,
  };
}

async function getLastCommitTime(): Promise<number> {
  try {
    const { stdout } = await execFile("git", ["log", "-1", "--format=%ct", "HEAD"]);
    return parseInt(stdout.trim(), 10);
  } catch {
    return 0;
  }
}

// Best-effort: cancelling a completed run is a no-op, not an error.
async function tryCancelRun(runId: string, owner: string, repo: string): Promise<string | null> {
  try {
    await rest("POST", `/repos/${owner}/${repo}/actions/runs/${runId}/cancel`);
    return runId;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // GitHub returns 409 when the run reached a terminal state — expected, not worth logging.
    if (/409|already completed|cannot cancel a workflow run that is completed/i.test(msg))
      return null;
    process.stderr.write(`pr-shepherd: cancel run ${runId} failed (ignored): ${msg}\n`);
    return null;
  }
}

async function getCurrentHeadSha(): Promise<string> {
  try {
    const { stdout } = await execFile("git", ["rev-parse", "HEAD"]);
    return stdout.trim();
  } catch {
    return "unknown";
  }
}

interface EscalateCheck {
  triggers: string[];
  thrashHistory?: EscalateDetails["attemptHistory"];
}

function checkEscalateTriggers(
  actionableThreads: ReviewThread[],
  actionableComments: PrComment[],
  changesRequestedReviews: Review[],
  actionableChecks: TriagedCheck[],
  threadAttempts: Record<string, number>,
  hasConflicts: boolean,
): EscalateCheck {
  const triggers: string[] = [];
  const maxAttempts = loadConfig().iterate.fixAttemptsPerThread;

  // Trigger 1: fix thrash — same thread dispatched too many times without resolving.
  const thrashThreads = actionableThreads.filter((t) => (threadAttempts[t.id] ?? 0) >= maxAttempts);
  if (thrashThreads.length > 0) {
    triggers.push("fix-thrash");
  }

  // Trigger 2: PR-level CHANGES_REQUESTED with no inline threads/comments/CI to act on.
  // Skip when there are merge conflicts — fix_code handles conflict resolution, not escalation.
  if (
    changesRequestedReviews.length > 0 &&
    actionableThreads.length === 0 &&
    actionableComments.length === 0 &&
    actionableChecks.length === 0 &&
    !hasConflicts
  ) {
    triggers.push("pr-level-changes-requested");
  }

  // Trigger 3: actionable thread has no file/line — cannot locate code to edit.
  const unlocatable = actionableThreads.filter((t) => t.path === null || t.line === null);
  if (unlocatable.length > 0) {
    triggers.push("thread-missing-location");
  }

  return {
    triggers,
    thrashHistory:
      thrashThreads.length > 0
        ? thrashThreads.map((t) => ({ threadId: t.id, attempts: threadAttempts[t.id] ?? 0 }))
        : undefined,
  };
}

interface BaseBranchLookup {
  branch: string;
  /** True when we could not confirm the branch name from GitHub. Callers must
   * escalate rather than emitting a rebase against a potentially-wrong base. */
  isFallback: boolean;
  /** Populated when `isFallback`; one-line reason shown in escalate output. */
  failureReason?: string;
}

/**
 * Validate the base branch name from the GraphQL batch (`report.baseBranch`)
 * and fall back safely if it's missing/unsafe. The branch is interpolated into
 * shell commands by `buildRebaseShellScript` and `buildFixInstructions`, so we
 * reject anything outside `[A-Za-z0-9._/-]` to prevent shell injection.
 *
 * Previously a separate `gh pr view --json baseRefName` subprocess — eliminated
 * per review feedback since the batch GraphQL query now returns it directly.
 */
function validateBaseBranch(raw: string): BaseBranchLookup {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return {
      branch: "main",
      isFallback: true,
      failureReason: "GraphQL batch returned an empty base branch name",
    };
  }
  if (!/^[A-Za-z0-9._/-]+$/.test(trimmed)) {
    return {
      branch: "main",
      isFallback: true,
      failureReason: `base branch ${JSON.stringify(trimmed)} contains unsafe characters`,
    };
  }
  return { branch: trimmed, isFallback: false };
}

function buildRebaseShellScript(baseBranch: string): string {
  return [
    `if ! git diff --quiet || ! git diff --cached --quiet; then`,
    `  echo "SKIP rebase: dirty worktree (uncommitted changes present)"`,
    `  exit 1`,
    `fi`,
    `git fetch origin && git rebase origin/${baseBranch} && git push --force-with-lease`,
  ].join("\n");
}

// Logins treated as bot authors regardless of the GitHub Bot/User user type.
// Mirrors plugin/skills/resolve/SKILL.md §3 — kept in sync with the resolve triage guidance.
const KNOWN_BOT_LOGINS = new Set([
  "copilot-pull-request-reviewer",
  "gemini-code-assist",
  "coderabbitai",
]);

function isBotAuthor(login: string): boolean {
  const bare = login.replace(/\[bot\]$/, "");
  if (bare !== login) return true;
  return KNOWN_BOT_LOGINS.has(bare);
}

export function classifyReviewSummaries(
  summaries: Review[],
  approvals: Review[],
  cfg: { bots: boolean; humans: boolean; approvals: boolean },
): { minimizeIds: string[]; surfacedSummaries: Review[] } {
  const minimizeIds: string[] = [];
  const surfacedSummaries: Review[] = [];
  for (const r of summaries) {
    const enabled = isBotAuthor(r.author) ? cfg.bots : cfg.humans;
    if (enabled) minimizeIds.push(r.id);
    else surfacedSummaries.push(r);
  }
  if (cfg.approvals) {
    for (const r of approvals) minimizeIds.push(r.id);
  }
  return { minimizeIds, surfacedSummaries };
}

// Patterns that indicate a comment is bot-generated noise rather than actionable feedback.
// Conservative: only match explicit known patterns to avoid accidentally suppressing real reviews.
const NOISE_PATTERNS = [
  /you have reached your daily quota/i,
  /please wait up to \d+ hours?/i,
  /rate[\s\-]?limit(?:ed)?\s*[—\-:]\s*try again/i,
  /resuming (monitoring|watch|checking)/i,
  /restarting (monitoring|watch)/i,
];

function isNoiseComment(comment: AgentComment): boolean {
  return NOISE_PATTERNS.some((p) => p.test(comment.body));
}

function classifyComments(comments: AgentComment[]): {
  actionable: AgentComment[];
  noiseIds: string[];
} {
  const actionable: AgentComment[] = [];
  const noiseIds: string[] = [];
  for (const c of comments) {
    if (isNoiseComment(c)) {
      noiseIds.push(c.id);
    } else {
      actionable.push(c);
    }
  }
  return { actionable, noiseIds };
}

function buildResolveCommand(
  threads: AgentThread[],
  actionableComments: AgentComment[],
  allCommentIds: string[],
  reviews: Review[],
  checks: import("../types.mts").AgentCheck[],
  prNumber: number,
): ResolveCommand {
  const argv = ["npx", "pr-shepherd", "resolve", String(prNumber)];

  if (threads.length > 0) {
    argv.push("--resolve-thread-ids", threads.map((t) => t.id).join(","));
  }
  if (allCommentIds.length > 0) {
    argv.push("--minimize-comment-ids", allCommentIds.join(","));
  }
  const hasDismiss = reviews.length > 0;
  if (hasDismiss) {
    argv.push("--dismiss-review-ids", reviews.map((r) => r.id).join(","));
    argv.push("--message", "$DISMISS_MESSAGE");
  }

  // A push happens when there is code to change — threads, actionable comments, CI checks, or reviews.
  // Noise-only comment minimization skips commit/push, so requiresHeadSha must be false.
  const requiresHeadSha =
    threads.length > 0 || actionableComments.length > 0 || checks.length > 0 || reviews.length > 0;

  // hasMutations = we appended at least one of --resolve-thread-ids,
  // --minimize-comment-ids, or --dismiss-review-ids. Returned explicitly
  // (rather than derived from argv.length) so callers don't couple to the
  // base-argv shape.
  const hasMutations = threads.length > 0 || allCommentIds.length > 0 || reviews.length > 0;

  return { argv, requiresHeadSha, requiresDismissMessage: hasDismiss, hasMutations };
}

/**
 * Render a ResolveCommand as a single-line command string for the monitor loop
 * to print or execute. This is NOT a general-purpose POSIX escaper — it wraps
 * the two known placeholders ($DISMISS_MESSAGE, $HEAD_SHA) and any whitespace-
 * bearing arg in double quotes so multi-word values don't split across flags.
 *
 * Contract for callers substituting placeholders: replace the entire quoted
 * token (including the surrounding `"`) with a properly shell-quoted literal.
 * Do not splice raw text inside the existing quotes — the output would then
 * re-expand `$…` / `$(…)` / embedded `"` and break.
 */
export function renderResolveCommand(rc: ResolveCommand): string {
  // `$HEAD_SHA` is never in `rc.argv` — it is appended pre-quoted below when
  // `requiresHeadSha`. Only `$DISMISS_MESSAGE` (or whitespace-bearing values)
  // need quoting here.
  const needsQuoting = (arg: string) => arg === "$DISMISS_MESSAGE" || /\s/.test(arg);
  const parts = rc.argv.map((a) => (needsQuoting(a) ? `"${a}"` : a));
  if (rc.requiresHeadSha) {
    parts.push("--require-sha", '"$HEAD_SHA"');
  }
  return parts.join(" ");
}

function buildFixInstructions(
  threads: AgentThread[],
  actionableComments: AgentComment[],
  checks: import("../types.mts").AgentCheck[],
  reviews: Review[],
  baseBranch: string,
  resolveCommand: ResolveCommand,
  hasConflicts: boolean,
  prNumber: number,
): string[] {
  const instructions: string[] = [];

  if (threads.length > 0 || actionableComments.length > 0) {
    instructions.push(
      `Apply code fixes: read and edit each file referenced under \`## Review threads\` and \`## Actionable comments\` above.`,
    );
  }
  // Mirror the truthiness checks in `formatIterateResult` (cli.mts) so each
  // AgentCheck maps to the same bullet shape here as there: runId → runId
  // bullet, else detailsUrl → external bullet, else `(no runId)` bullet.
  const checksWithRunId = checks.filter((c) => c.runId);
  const externalChecks = checks.filter((c) => !c.runId && c.detailsUrl);
  const bareChecks = checks.filter((c) => !c.runId && !c.detailsUrl);
  if (checksWithRunId.length > 0) {
    instructions.push(
      `For each bullet in \`## Failing checks\` whose backticked locator is a numeric runId (GitHub Actions): run \`gh run view <runId> --log-failed\`, identify the failure, and apply the fix.`,
    );
  }
  if (externalChecks.length > 0) {
    instructions.push(
      `For each bullet in \`## Failing checks\` starting with \`external\` (external status check): open the linked URL in a browser to inspect the failure — \`gh run view\` cannot fetch logs for external checks.`,
    );
  }
  if (bareChecks.length > 0) {
    instructions.push(
      `For each bullet in \`## Failing checks\` starting with \`(no runId)\`: there is no run or details URL to inspect. Escalate these to a human — they require manual investigation outside the pr-shepherd flow.`,
    );
  }
  if (reviews.length > 0) {
    instructions.push(
      `For each bullet under \`## Changes-requested reviews\` above: read the review body and apply the requested changes.`,
    );
  }

  const hasCodeChanges =
    threads.length > 0 || actionableComments.length > 0 || checks.length > 0 || reviews.length > 0;
  const needsPush = hasCodeChanges || hasConflicts;

  if (hasCodeChanges) {
    instructions.push(
      `Commit changed files: \`git add <files> && git commit -m "<descriptive message>"\``,
    );
    instructions.push(
      `Keep the PR title and description current: if the changes alter the PR's scope or intent, run \`gh pr edit ${prNumber} --title "<new title>" --body "<new body>"\` to reflect them. Skip if the existing title/body still accurately describe the PR.`,
    );
  }

  if (needsPush) {
    const captureHint = resolveCommand.requiresHeadSha
      ? ` — capture \`HEAD_SHA=$(git rev-parse HEAD)\``
      : "";
    if (hasConflicts) {
      instructions.push(
        `Rebase with conflict resolution: run \`git fetch origin && git rebase origin/${baseBranch}\`. If the rebase halts with conflicts, edit the conflicted files to resolve them, \`git add <files>\`, then \`git rebase --continue\`. Repeat until the rebase completes, then \`git push --force-with-lease\`${captureHint}.`,
      );
    } else {
      instructions.push(
        `Rebase and push: \`git fetch origin && git rebase origin/${baseBranch} && git push --force-with-lease\`${captureHint}`,
      );
    }
  }

  // Only tell the agent to run `resolve:` if the command actually mutates
  // GitHub state. A CONFLICTS-only flow has nothing to mutate on GitHub.
  if (resolveCommand.hasMutations) {
    const substituteParts: string[] = [];
    if (resolveCommand.requiresHeadSha) {
      substituteParts.push(`"$HEAD_SHA" with the pushed commit SHA`);
    }
    if (resolveCommand.requiresDismissMessage) {
      substituteParts.push(`$DISMISS_MESSAGE with a one-sentence description of what you changed`);
    }
    const substituteHint =
      substituteParts.length > 0 ? `, substituting ${substituteParts.join(" and ")}` : "";
    instructions.push(`Run the \`resolve:\` command shown above${substituteHint}.`);
  }

  return instructions;
}


function buildWaitLog(base: IterateResultBase): string {
  const { summary, mergeStateStatus, remainingSeconds } = base;
  const parts: string[] = [`WAIT: ${summary.passing} passing, ${summary.inProgress} in-progress`];

  switch (mergeStateStatus) {
    case "BEHIND":
      parts.push("branch is behind base");
      break;
    case "BLOCKED":
      parts.push("blocked by pending reviews or required status checks");
      break;
    case "DRAFT":
      parts.push("PR is a draft");
      break;
    case "UNSTABLE":
      parts.push("some checks are unstable");
      break;
  }

  if (remainingSeconds > 0) {
    parts.push(`${remainingSeconds}s until auto-cancel`);
  }

  return parts.join(" — ");
}

function computeStallFingerprint(
  action: string,
  headSha: string,
  base: IterateResultBase,
  report: Awaited<ReturnType<typeof runCheck>>,
  reviewSummaryIds: string[],
): string {
  const checks = [
    ...report.checks.failing.map((f) => `failing:${f.name}:${f.failureKind ?? ""}`),
    ...report.checks.inProgress.map((p) => `inProgress:${p.name}`),
  ].sort();
  const threads = report.threads.actionable.map((t) => t.id).sort();
  const comments = report.comments.actionable.map((c) => c.id).sort();
  const reviews = report.changesRequestedReviews.map((r) => r.id).sort();
  const summaries = [...reviewSummaryIds].sort();
  return JSON.stringify({
    action,
    headSha,
    status: base.status,
    mergeStateStatus: base.mergeStateStatus,
    state: base.state,
    isDraft: base.isDraft,
    checks,
    threads,
    comments,
    reviews,
    summaries,
  });
}

async function applyStallGuard(
  stallKey: { owner: string; repo: string; pr: number },
  stallTimeoutSeconds: number,
  headSha: string,
  base: IterateResultBase,
  prNumber: number,
  prospectiveResult: IterateResult,
  report: Awaited<ReturnType<typeof runCheck>>,
  reviewSummaryIds: string[],
): Promise<IterateResult> {
  const fingerprint = computeStallFingerprint(
    prospectiveResult.action,
    headSha,
    base,
    report,
    reviewSummaryIds,
  );

  const nowSeconds = Math.floor(Date.now() / 1000);
  const stored = await readStallState(stallKey);

  if (stored && stored.fingerprint === fingerprint) {
    const ageSeconds = nowSeconds - stored.firstSeenAt;
    if (ageSeconds < 0 || stallTimeoutSeconds <= 0) {
      // Clock skew or stall detection disabled — refresh firstSeenAt so re-enabling starts fresh.
      await writeStallState(stallKey, { fingerprint, firstSeenAt: nowSeconds });
    } else if (ageSeconds >= stallTimeoutSeconds) {
      const stalledMinutes = Math.floor(ageSeconds / 60);
      const escalateBase: Omit<EscalateDetails, "humanMessage"> = {
        triggers: ["stall-timeout"],
        unresolvedThreads: report.threads.actionable.map(toAgentThread),
        ambiguousComments: report.comments.actionable.map(toAgentComment),
        changesRequestedReviews: report.changesRequestedReviews,
        suggestion: buildEscalateSuggestion(["stall-timeout"], String(stalledMinutes)),
      };
      return {
        ...base,
        action: "escalate",
        escalate: {
          ...escalateBase,
          humanMessage: buildEscalateHumanMessage(escalateBase, prNumber),
        },
      };
    }
    // Within threshold: preserve firstSeenAt, emit the original result.
    return prospectiveResult;
  }

  // Fingerprint changed or no prior state — reset the stall timer.
  await writeStallState(stallKey, { fingerprint, firstSeenAt: nowSeconds });
  return prospectiveResult;
}

function buildEscalateHumanMessage(
  escalate: Omit<EscalateDetails, "humanMessage">,
  pr: number,
): string {
  const lines: string[] = [];
  lines.push("⚠️  /pr-shepherd:monitor paused — needs human direction");
  lines.push("");
  lines.push(`**Triggers:** ${escalate.triggers.map((t) => `\`${t}\``).join(", ")}`);
  lines.push("");
  lines.push(escalate.suggestion);

  const hasItems =
    escalate.unresolvedThreads.length > 0 ||
    escalate.changesRequestedReviews.length > 0 ||
    escalate.ambiguousComments.length > 0;
  if (hasItems) {
    lines.push("");
    lines.push("## Items needing attention");
    for (const t of escalate.unresolvedThreads) {
      const loc = t.path ? `\`${t.path}:${t.line ?? "?"}\`` : "(no location)";
      const firstLine = t.body.split("\n")[0] ?? "";
      lines.push(`- thread \`${t.id}\` — ${loc} (@${t.author}): ${firstLine}`);
    }
    for (const r of escalate.changesRequestedReviews) {
      const firstLine = r.body.split("\n")[0] ?? "";
      lines.push(`- review \`${r.id}\` (@${r.author}): ${firstLine}`);
    }
    for (const c of escalate.ambiguousComments) {
      const firstLine = c.body.split("\n")[0] ?? "";
      lines.push(`- comment \`${c.id}\` (@${c.author}): ${firstLine}`);
    }
  }

  if (escalate.attemptHistory && escalate.attemptHistory.length > 0) {
    lines.push("");
    lines.push("## Fix attempts");
    for (const a of escalate.attemptHistory) {
      lines.push(`- thread \`${a.threadId}\` attempted ${a.attempts} times`);
    }
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(`Run \`/pr-shepherd:check ${pr}\` to see current state.`);
  lines.push(`After fixing manually, rerun \`/pr-shepherd:monitor ${pr}\` to resume.`);
  return lines.join("\n");
}

function buildEscalateSuggestion(triggers: string[], detail?: string): string {
  if (triggers.includes("stall-timeout")) {
    const mins = detail ?? "30";
    return `No progress detected for ${mins} minute${parseInt(mins, 10) === 1 ? "" : "s"} — state has not changed. Inspect the PR and resume manually once the blocking issue is resolved.`;
  }
  if (triggers.includes("base-branch-unknown")) {
    const reason = detail ? ` (${detail})` : "";
    return `Could not determine the PR's base branch${reason} — refusing to emit a rebase that could force-push onto the wrong base. Run the rebase manually against the PR's real target branch.`;
  }
  if (triggers.includes("fix-thrash")) {
    return "Same thread(s) attempted multiple times without resolution — fix manually then rerun /pr-shepherd:monitor";
  }
  if (triggers.includes("pr-level-changes-requested")) {
    return "Reviewer requested changes but left no inline comments — read the review and act manually";
  }
  if (triggers.includes("thread-missing-location")) {
    return "Review thread has no file/line reference — cannot locate code to edit automatically";
  }
  return "Ambiguous state — inspect the PR and act manually";
}
