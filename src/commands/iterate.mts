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
  };

  // Step 3 cont.: cancel if ready-delay elapsed.
  if (readyState.shouldCancel) {
    return {
      ...base,
      action: "cancel",
      log: `CANCEL: PR #${base.pr} has been ready for review — ready-delay elapsed, stopping monitor`,
    };
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
      const escalateDetails: EscalateDetails = {
        triggers: escalateTriggers.triggers,
        unresolvedThreads: report.threads.actionable.map(toAgentThread),
        ambiguousComments: report.comments.actionable.map(toAgentComment),
        changesRequestedReviews: report.changesRequestedReviews,
        attemptHistory: escalateTriggers.thrashHistory,
        suggestion: buildEscalateSuggestion(escalateTriggers.triggers),
        humanMessage: "",
      };
      escalateDetails.humanMessage = buildEscalateHumanMessage(escalateDetails, prNumber);
      return { ...base, action: "escalate", escalate: escalateDetails };
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

    const baseBranch = await getBaseBranch(prNumber);
    const threads = report.threads.actionable.map(toAgentThread);
    const { actionable: actionableComments, noiseIds: noiseCommentIds } = classifyComments(
      report.comments.actionable.map(toAgentComment),
    );
    const checks = toAgentChecks(actionableChecks);
    const { changesRequestedReviews } = report;
    const allCommentIds = [...actionableComments.map((c) => c.id), ...noiseCommentIds];
    const resolveCommand = buildResolveCommand(
      threads,
      allCommentIds,
      changesRequestedReviews,
      checks,
      prNumber,
    );
    const instructions = buildFixInstructions(
      threads,
      actionableComments,
      checks,
      changesRequestedReviews,
      baseBranch,
      resolveCommand,
    );

    return {
      ...base,
      action: "fix_code",
      fix: {
        threads,
        actionableComments,
        noiseCommentIds,
        checks,
        changesRequestedReviews,
        baseBranch,
        resolveCommand,
        instructions,
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
    return {
      ...base,
      action: "rerun_ci",
      reran: uniqueRunIds,
      log: `RERAN ${uniqueRunIds.length} CI check${uniqueRunIds.length === 1 ? "" : "s"}: ${uniqueRunIds.join(" ")}`,
    };
  }

  // Step 6: Flaky + behind — rebase needed.
  const hasFlaky = report.checks.failing.some((f) => f.failureKind === "flaky");
  if (hasFlaky && report.mergeStatus.status === "BEHIND" && config.actions.autoRebase) {
    const baseBranch = await getBaseBranch(prNumber);
    return {
      ...base,
      action: "rebase",
      rebase: {
        baseBranch,
        reason: `Branch is behind ${baseBranch} — rebasing to pick up latest changes and clear flaky failures`,
        shellScript: buildRebaseShellScript(baseBranch),
      },
    };
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
    return {
      ...base,
      action: "mark_ready",
      markedReady: true,
      log: `MARKED READY: PR #${report.pr} converted from draft to ready for review`,
    };
  }

  // Step 8: Nothing to do.
  return {
    ...base,
    action: "wait",
    log: buildWaitLog(base),
  };
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
    if (/already completed|cannot cancel a workflow run that is completed/i.test(msg)) return null;
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

async function getBaseBranch(prNumber: number): Promise<string> {
  try {
    const { stdout } = await execFile("gh", [
      "pr",
      "view",
      String(prNumber),
      "--json",
      "baseRefName",
      "--jq",
      ".baseRefName",
    ]);
    return stdout.trim() || "main";
  } catch {
    return "main";
  }
}

function buildRebaseShellScript(baseBranch: string): string {
  return [
    `if ! git diff --quiet || ! git diff --cached --quiet; then`,
    `  echo "SKIP rebase: dirty worktree (uncommitted changes present)"`,
    `  exit 0`,
    `fi`,
    `git fetch origin && git rebase origin/${baseBranch} && git push --force-with-lease`,
  ].join("\n");
}

// Patterns that indicate a comment is bot-generated noise rather than actionable feedback.
// Conservative: only match explicit known patterns to avoid accidentally suppressing real reviews.
const NOISE_PATTERNS = [
  /you have reached your daily quota/i,
  /please wait up to \d+ hours?/i,
  /rate.?limit(?:ed)? — try again/i,
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

  // A push only happens when there is code to change — threads, CI checks, or review requests.
  // Noise-only comment minimization skips commit/push, so requiresHeadSha must be false.
  const requiresHeadSha = threads.length > 0 || checks.length > 0 || reviews.length > 0;

  return { argv, requiresHeadSha, requiresDismissMessage: hasDismiss };
}

function buildFixInstructions(
  threads: AgentThread[],
  actionableComments: AgentComment[],
  checks: import("../types.mts").AgentCheck[],
  reviews: Review[],
  baseBranch: string,
  resolveCommand: ResolveCommand,
): string[] {
  const resolveCmd =
    resolveCommand.argv.join(" ") +
    (resolveCommand.requiresHeadSha ? ' --require-sha "$HEAD_SHA"' : "");
  const instructions: string[] = [];

  if (threads.length > 0 || actionableComments.length > 0) {
    instructions.push(
      `Apply code fixes: read and edit each file referenced in fix.threads and fix.actionableComments.`,
    );
  }
  if (checks.length > 0) {
    instructions.push(
      `For each fix.checks[].runId: run gh run view <runId> --log-failed, identify the failure, and apply the fix.`,
    );
  }
  if (reviews.length > 0) {
    instructions.push(
      `For each fix.changesRequestedReviews: read the review body and apply the requested changes.`,
    );
  }
  if (resolveCommand.requiresHeadSha) {
    instructions.push(
      `Commit changed files: git add <files> && git commit -m "<descriptive message>"`,
    );
    instructions.push(
      `Rebase and push: git fetch origin && git rebase origin/${baseBranch} && git push --force-with-lease — capture HEAD_SHA=$(git rev-parse HEAD)`,
    );
  }
  instructions.push(
    `Run the resolve command (substitute $HEAD_SHA with the pushed commit SHA${resolveCommand.requiresDismissMessage ? `; substitute $DISMISS_MESSAGE with a one-sentence description of what you changed` : ""}): ${resolveCmd}`,
  );

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

function buildEscalateHumanMessage(
  escalate: Omit<EscalateDetails, "humanMessage">,
  pr: number,
): string {
  const lines: string[] = [];
  lines.push("⚠️  /pr-shepherd:monitor paused — needs human direction");
  lines.push("");
  lines.push(`Triggers: ${escalate.triggers.join(", ")}`);
  lines.push(escalate.suggestion);
  lines.push("");
  lines.push("Items needing attention:");
  for (const t of escalate.unresolvedThreads) {
    const loc = t.path ? `${t.path}:${t.line ?? "?"}` : "(no location)";
    const firstLine = t.body.split("\n")[0] ?? "";
    lines.push(`- threadId=${t.id} ${loc} (@${t.author}): ${firstLine}`);
  }
  for (const r of escalate.changesRequestedReviews) {
    const firstLine = r.body.split("\n")[0] ?? "";
    lines.push(`- reviewId=${r.id} (@${r.author}): ${firstLine}`);
  }
  if (escalate.attemptHistory && escalate.attemptHistory.length > 0) {
    lines.push("");
    lines.push(
      "Fix attempts: " +
        escalate.attemptHistory
          .map((a) => `threadId=${a.threadId} attempted ${a.attempts} times`)
          .join(", "),
    );
  }
  lines.push("");
  lines.push(`Run /pr-shepherd:check ${pr} to see current state.`);
  lines.push("After fixing manually, rerun /pr-shepherd:monitor to resume.");
  return lines.join("\n");
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
