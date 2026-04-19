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
import { readFixAttempts, writeFixAttempts } from "../cache/fix-attempts.mts";
import { toAgentThread, toAgentComment, toAgentChecks } from "../reporters/agent.mts";
import type {
  EscalateDetails,
  IterateCommandOptions,
  IterateResult,
  IterateResultBase,
  IterateResultSummary,
  PrComment,
  ReviewThread,
  Review,
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
      action: "cancel",
    };
  }

  // Step 3: Ready-delay state machine.
  const [repoOwner, repoName] = report.repo.split("/");
  const isReady = report.status === "READY";
  const readyState = await updateReadyDelay(
    report.pr,
    isReady,
    readyDelaySeconds,
    repoOwner!,
    repoName!,
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
  };

  // Step 3 cont.: cancel if ready-delay elapsed.
  if (readyState.shouldCancel) {
    return { ...base, action: "cancel" };
  }

  // Triage failing checks now that we know we need failureKind for steps 4–6.
  if (report.checks.failing.length > 0) {
    const triaged = await triageFailingChecks(report.checks.failing);
    report = { ...report, checks: { ...report.checks, failing: triaged } };
  }

  // Step 4: Actionable work — fix comments, review requests, CI failures, and merge
  // conflicts all in one push. CONFLICTS is included here because the fix_code handler
  // already runs fetch+rebase+push, so conflicts are resolved as part of that flow.
  const actionableChecks = report.checks.failing.filter((f) => f.failureKind === "actionable");
  const hasActionableWork =
    report.threads.actionable.length > 0 ||
    report.comments.actionable.length > 0 ||
    report.changesRequestedReviews.length > 0 ||
    actionableChecks.length > 0 ||
    report.mergeStatus.status === "CONFLICTS";

  if (hasActionableWork) {
    // Load fix-attempt counts, resetting if HEAD SHA changed (new commit pushed).
    const headSha = await getCurrentHeadSha();
    const attemptsKey = { owner: repoOwner!, repo: repoName!, pr: prNumber };
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
      return {
        ...base,
        action: "escalate",
        escalate: {
          triggers: escalateTriggers.triggers,
          unresolvedThreads: report.threads.actionable.map(toAgentThread),
          ambiguousComments: report.comments.actionable.map(toAgentComment),
          changesRequestedReviews: report.changesRequestedReviews,
          attemptHistory: escalateTriggers.thrashHistory,
          suggestion: buildEscalateSuggestion(escalateTriggers.triggers),
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
      const results = await Promise.all(uniqueRunIds.map((id) => tryCancelRun(id)));
      cancelled = results.filter((id): id is string => id !== null);
    }
    return {
      ...base,
      action: "fix_code",
      fix: {
        threads: report.threads.actionable.map(toAgentThread),
        comments: report.comments.actionable.map(toAgentComment),
        checks: toAgentChecks(actionableChecks),
        changesRequestedReviews: report.changesRequestedReviews,
      },
      cancelled,
    };
  }

  // Step 5: Transient failures (timeout / infrastructure) — no actionable work, no conflicts.
  const transientChecks = report.checks.failing.filter(
    (f) => f.failureKind === "timeout" || f.failureKind === "infrastructure",
  );
  if (transientChecks.length > 0 && !opts.noAutoRerun) {
    // Deduplicate runIds — multiple failed steps can share the same runId.
    const uniqueRunIds = [
      ...new Set(transientChecks.map((c) => c.runId).filter((id) => id !== null)),
    ];
    await Promise.all(
      uniqueRunIds.map((runId) => runGhCommand(["run", "rerun", runId, "--failed"])),
    );
    return { ...base, action: "rerun_ci", reran: uniqueRunIds };
  }

  // Step 6: Flaky + behind — rebase needed.
  const hasFlaky = report.checks.failing.some((f) => f.failureKind === "flaky");
  if (hasFlaky && report.mergeStatus.status === "BEHIND" && config.actions.autoRebase) {
    return { ...base, action: "rebase" };
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
    await runGhCommand(["pr", "ready", String(report.pr)]);
    return { ...base, action: "mark_ready", markedReady: true };
  }

  // Step 8: Nothing to do.
  return { ...base, action: "wait" };
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

async function runGhCommand(args: string[]): Promise<void> {
  try {
    await execFile("gh", args);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`gh ${args.join(" ")} failed: ${msg}`, { cause: err });
  }
}

// Best-effort: cancelling a completed run is a no-op, not an error.
async function tryCancelRun(runId: string): Promise<string | null> {
  try {
    await execFile("gh", ["run", "cancel", runId]);
    return runId;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // gh returns this when the run reached a terminal state — expected, not worth logging.
    if (/cannot cancel a workflow run that is completed/i.test(msg)) return null;
    process.stderr.write(`pr-shepherd: gh run cancel ${runId} failed (ignored): ${msg}\n`);
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

function buildEscalateSuggestion(triggers: string[]): string {
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
