/** Instruction text for a PR that GitHub removed from the merge queue after failed checks. */

import type { AgentCheck, ShepherdReport } from "../../types.mts";

/** Which recovery command, if any, Shepherd printed for a failure that does not reproduce. */
type QueueEjectionRecovery = "requeue" | "acknowledge" | "none";

interface QueueEjectionInput {
  baseBranch: string;
  queueCommitOid: string;
  /** The printed native-stack rebase step; absent outside a native stack. */
  stackRebase?: string;
  recovery: QueueEjectionRecovery;
}

/** The removed queue commit whose failed checks this tick surfaces, if the removal is current. */
export function currentEjectionCommit(
  report: ShepherdReport,
  checks: AgentCheck[],
): string | undefined {
  const queue = report.mergeQueue;
  const commit = queue?.latestRemoval?.beforeCommitOid;
  if (!commit || queue.inQueue || queue.headUpdatedAfterRemoval) return undefined;
  return checks.some((check) => check.scope === "merge_group" && check.commitOid === commit)
    ? commit
    : undefined;
}

/** Rebase and reproduce, then fix, and recover only a failure that does not reproduce. */
export function buildQueueEjectionInstruction(input: QueueEjectionInput): string {
  const { baseBranch, queueCommitOid, stackRebase, recovery } = input;
  const rebase = stackRebase
    ? `Update the stack onto the latest \`${baseBranch}\` and reproduce the failing step on this layer's rebased head: ${stackRebase}`
    : `Rebase the PR head onto the latest \`${baseBranch}\` and reproduce the failing step on the rebased head.`;
  const push = stackRebase
    ? "push the rewritten stack with `gh stack push`"
    : "push the rebased head";
  const requeueNote =
    recovery === "requeue"
      ? " Shepherd emits a fresh queue command once the new head is READY; do not run `requeue:` after any push."
      : "";
  return [
    `This PR left the merge queue, and checks failed on its queue commit \`${queueCommitOid}\`, which combined the PR head with \`${baseBranch}\` and any entries queued ahead of it. Do not requeue without triage.`,
    rebase,
    "If the failure belongs to this PR, fix it, commit, push, and iterate.",
    `If the failure does not reproduce and the rebase moved the head, ${push} and iterate.${requeueNote}`,
    `If the failure reproduces but comes from \`${baseBranch}\` itself, do not ${recovery === "acknowledge" ? "acknowledge" : "requeue"} it; report it.`,
    recoveryStep(recovery),
  ].join(" ");
}

function recoveryStep(recovery: QueueEjectionRecovery): string {
  const condition =
    "Only if the rebase was a no-op, no code changed, no other blocker remains, and the failure does not reproduce (the logs show a transient failure, or a failure caused by another entry in the same queue group),";
  if (recovery === "requeue")
    return `${condition} run the \`requeue:\` command exactly as printed. If gh reports auto-merge is disabled instead of adding the PR to the queue, run the \`requeue API fallback:\` command. Both commands require the observed PR head SHA; if the head changed, iterate for a fresh command.`;
  if (recovery === "acknowledge")
    return `${condition} run \`acknowledge queue removal:\` exactly as printed. This records only the disposition of that removed queue commit; finish this one-PR session to validate current source CI and record its READY receipt, then return to the aggregate \`--stack\` selector with its original options. In merge mode it verifies lower-layer readiness before merging. Do not enqueue or merge this layer directly.`;
  return "Shepherd printed no queue command for this session, so do not enqueue the PR; report a failure that does not reproduce instead.";
}
