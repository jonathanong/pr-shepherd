/** Instruction text for a PR that GitHub removed from the merge queue after failed checks. */

/** Non-stack `--merge` sessions: rebase, then fix, and requeue only a transient failure. */
export function buildRequeueInstruction(baseBranch: string, queueCommitOid: string): string {
  return [
    `GitHub removed this PR from the merge queue after checks failed on queue commit \`${queueCommitOid}\`, which combined the PR head with \`${baseBranch}\`. Do not requeue without triage.`,
    `Rebase the PR head onto the latest \`${baseBranch}\` and reproduce the failing step on the rebased head.`,
    "If the failure belongs to this PR, fix it, commit, push, and iterate.",
    "If the failure does not reproduce and the rebase moved the head, push the rebased head and iterate. Shepherd emits a fresh queue command once the new head is READY; do not run `requeue:` after any push.",
    `If the failure reproduces but comes from \`${baseBranch}\` itself, do not requeue; report it.`,
    "Only if the rebase was a no-op, no code changed, no other blocker remains, and the logs show a transient failure, run the `requeue:` command exactly as printed. If gh reports auto-merge is disabled instead of adding the PR to the queue, run the `requeue API fallback:` command. Both commands require the observed PR head SHA; if the head changed, iterate for a fresh command.",
  ].join(" ");
}

/** Native-stack layers: fix, and acknowledge only a transient failure. */
export function buildQueueRemovalAcknowledgmentInstruction(): string {
  return [
    "If the merge-group failure belongs to this PR, fix and push its head, then iterate.",
    "If the failure reproduces against the latest stack base without this PR's changes, do not acknowledge it; report it.",
    "Only if no code changed, no other blocker remains, and the logs show a transient failure, run `acknowledge queue removal:` exactly as printed.",
    "This records only the disposition of that removed queue commit; finish this one-PR session to validate current source CI and record its READY receipt, then return to the aggregate `--stack` selector with its original options. In merge mode it verifies lower-layer readiness before merging. Do not enqueue or merge this layer directly.",
  ].join(" ");
}
