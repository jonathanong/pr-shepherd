import type { ShepherdReport } from "../types.mts";
import type { AgentRuntime } from "../agent-runtime.mts";

/**
 * Build the numbered instruction steps for the agent to follow after a `check` run.
 * All rebase policy, CI budget policy, and ready-to-merge gating live here so the
 * skill stays a thin dispatcher and these rules co-evolve with the CLI data model.
 */
export function buildCheckInstructions(
  report: ShepherdReport,
  opts?: { runtime?: AgentRuntime },
): string[] {
  const runtime = opts?.runtime ?? "claude";
  const { mergeStatus, checks, threads, comments, changesRequestedReviews, status } = report;

  const instructions: string[] = [];

  // 1. Summary
  const totalActionable =
    threads.actionable.length +
    threads.resolutionOnly.length +
    comments.actionable.length +
    changesRequestedReviews.length;
  const total =
    checks.passing.length +
    checks.failing.length +
    checks.inProgress.length +
    checks.skipped.length;
  const copilotNote = mergeStatus.copilotReviewInProgress ? " (Copilot review in progress)" : "";
  instructions.push(
    `Report: merge status is ${mergeStatus.status}${copilotNote}, CI ${checks.passing.length}/${total} passed` +
      (checks.failing.length > 0 ? ` (${checks.failing.length} failing)` : "") +
      (checks.inProgress.length > 0 ? ` (${checks.inProgress.length} in progress)` : "") +
      `, ${totalActionable} actionable review item(s).`,
  );

  // 2. Rebase policy (only emit when relevant)
  if (mergeStatus.status === "CONFLICTS") {
    instructions.push(
      "Rebase required: the branch has merge conflicts that must be resolved before this PR can land.",
    );
  } else if (mergeStatus.status === "BEHIND") {
    instructions.push(
      "The PR is behind the base branch. A rebase is optional if all CI checks pass.",
    );
  }

  // 3. CI budget policy — one instruction per failing check
  for (const c of checks.failing) {
    const stepHint = c.failedStep ? ` (failed step: \`${c.failedStep}\`)` : "";
    const diagnosisHint = c.runId
      ? c.conclusion === "CANCELLED"
        ? `cancelled — if unintended, rerun with \`gh run rerun ${c.runId}\``
        : `run \`gh run view ${c.runId} --log-failed\`${stepHint} to diagnose — if transient, rerun with \`gh run rerun ${c.runId} --failed\`; otherwise apply a fix`
      : c.detailsUrl
        ? `open the check details (${c.detailsUrl}) to diagnose the failure`
        : `no run or details URL available — escalate to a human`;
    instructions.push(`Failing check: \`${c.name}\` — ${diagnosisHint}.`);
  }

  // 4. Ready-to-merge gate
  const isClean = mergeStatus.mergeStateStatus === "CLEAN";
  const isReady = isClean && status === "READY" && !mergeStatus.copilotReviewInProgress;
  if (isReady) {
    instructions.push(
      "This PR is ready to merge: mergeStateStatus is CLEAN, status is READY, and no Copilot review is in progress.",
    );
  } else {
    const blockers: string[] = [];
    if (!isClean) blockers.push(`mergeStateStatus is ${mergeStatus.mergeStateStatus} (not CLEAN)`);
    if (status !== "READY") blockers.push(`status is ${status} (not READY)`);
    if (mergeStatus.copilotReviewInProgress) blockers.push("Copilot review is still in progress");
    instructions.push(`Do not declare this PR ready to merge: ${blockers.join("; ")}.`);
  }

  // 5. Continuous monitoring pointer (suppressed only when truly ready to merge)
  if (!isReady) {
    instructions.push(
      runtime === "codex"
        ? `This is a one-shot check. For follow-up monitoring, run \`npx pr-shepherd ${report.pr}\`.`
        : "This is a one-shot check. For continuous monitoring that acts on these signals automatically, use `/pr-shepherd:monitor`.",
    );
  }

  return instructions;
}
