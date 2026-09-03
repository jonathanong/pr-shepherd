import type { AgentCheck, ResolveCommand, Review } from "../../types.mts";

/** Build the stale-CR clause appended to the `## Changes-requested reviews` instruction. */
export function buildCrStaleClause(reviews: Review[]): string {
  const human = reviews.some((r) => r.staleReview && !r.staleBotCr)
    ? " `[stale]` bullets are human CRs on an old commit. Ask the reviewer to re-review."
    : "";
  return human;
}

/**
 * Build the optional behind-base push hint. Empty unless the branch is actually behind its base
 * and the user configured a non-blank `iterate.behindBaseHint` — the CLI never prescribes
 * rebase/merge mechanics itself (see "Keep skills and loop prompts minimal" in CLAUDE.md); this
 * only echoes back the caller's own configured pointer. `hint` is trimmed and type-checked at the
 * point of use (rather than at config load) so a malformed rc file value (non-string, or
 * whitespace-only) degrades to "no hint" instead of rendering garbage into agent-facing text or
 * discarding the rest of the user's config.
 */
export function buildBehindBaseHintInstruction(
  baseBranch: string,
  hint: string,
  isBehind: boolean,
): string[] {
  const trimmedHint = typeof hint === "string" ? hint.trim() : "";
  if (!isBehind || trimmedHint === "") return [];
  return [`The branch is behind PR base branch \`${baseBranch}\`. ${trimmedHint} before pushing.`];
}

/**
 * Give one branch-refresh recovery path after Shepherd's single workflow rerun has failed.
 * The fetched PR base branch is raw context; the caller still owns repository-specific git
 * mechanics and decides whether the base contains a relevant fix.
 */
export function buildRepeatedWorkflowBranchRecoveryInstructions(
  baseBranch: string,
  hasExhaustedWorkflowRerun: boolean,
  branch: { isBehind: boolean; hasConflicts: boolean },
): string[] {
  if (!hasExhaustedWorkflowRerun || (!branch.isBehind && !branch.hasConflicts)) return [];

  const state = branch.hasConflicts ? "conflicts with" : "is behind";
  const instructions = [
    `The workflow rerun still fails while the branch ${state} PR base branch \`${baseBranch}\`. Inspect the current base branch for an existing fix before choosing a remediation.`,
  ];
  instructions.push(
    branch.hasConflicts
      ? `Rebase or otherwise update the PR branch from \`${baseBranch}\` according to repository conventions, resolving conflicts as part of that update.`
      : `Rebase or otherwise update the PR branch from \`${baseBranch}\` according to repository conventions.`,
  );
  return instructions;
}

/**
 * Build the `Run the apply review: command` instruction. Steps stay here (not in the skill)
 * whenever the *unmodified, as-printed* command is unsafe without them:
 *
 * - `$HEAD_SHA`/`$DISMISS_MESSAGE` substitution: without it, the printed command has an
 *   empty `--message`/invalid `--require-sha` and `apply review` rejects the mutation.
 * Marker-based self-reply routing is already reflected in the generated IDs. The instruction
 * below makes that behavior explicit so an authenticated viewer's unmarked human feedback is
 * not mistaken for an automated reply merely because the GitHub login matches.
 *
 * Contrast with what *does* stay in the skill's "Review-mutation mechanics" playbook —
 * dismiss-ID retention and the first-look/annotation ID-exclusion rules. Those only matter
 * if the caller *edits* the printed command (removes an ID, or adds one back); the printed
 * command run unmodified is already correct for them. The pointer below is load-bearing:
 * without it, nothing in CLI output tells the agent that playbook exists.
 */
export function buildResolveCommandInstruction(resolveCommand: ResolveCommand): string[] {
  if (!resolveCommand.hasMutations) return [];
  const instructions: string[] = [];
  if ((resolveCommand.replyThreadIds?.length ?? 0) > 0) {
    instructions.push(
      "Run the generated thread IDs unchanged. A latest comment beginning `<!-- pr-shepherd -->` is an established Shepherd reply; a marked viewer-authored human thread is emitted resolve-only, not for another reply.",
    );
  }
  if (resolveCommand.requiresHeadSha) {
    instructions.push(
      "If you did not change code, replace `$HEAD_SHA` with `$(git rev-parse HEAD)`, which must equal the current remote PR head. If you changed code, commit and push to the PR head branch first, then replace `$HEAD_SHA` with the pushed commit SHA.",
    );
  }
  if (resolveCommand.requiresDismissMessage) {
    instructions.push("Replace `$DISMISS_MESSAGE` with one sentence describing what changed.");
  }
  instructions.push(
    'Run the `apply review:` command shown above. See "Review-mutation mechanics" in the pr-shepherd skill for dismiss-ID retention.',
  );
  return instructions;
}

/** Build the CI-triage pointer; the skill limits follow-up actions to included evidence. */
export function buildFailingCheckInstructions(checks: AgentCheck[]): string[] {
  if (checks.length === 0) return [];
  const hasBare = checks.some((c) => !c.runId && !c.detailsUrl);
  const hasTriageable = checks.some((c) => c.runId || c.detailsUrl);
  const hasRerunAuthorized = checks.some((c) => c.rerunCommand);

  const instructions: string[] = [];
  if (hasTriageable) {
    instructions.push(
      'Triage every failure under `## Failing checks`. See "CI failure triage" in the pr-shepherd skill for read-only inspection rules.',
    );
  }
  if (hasRerunAuthorized) {
    instructions.push(
      'A `[rerun authorized]` check includes a `rerun:` command. See "CI failure triage" in the pr-shepherd skill for which conclusions warrant a rerun versus a code fix.',
    );
  }
  if (hasBare) {
    instructions.push(
      "For each `(no runId)` failure, preserve the displayed metadata; Shepherd will escalate when no other autonomous work remains.",
    );
  }

  return instructions;
}

export function buildFixCompletionInstruction(
  checks: AgentCheck[],
  hasConflicts = false,
  hasShaGatedReviewMutations = false,
): string {
  if (hasConflicts)
    return "`[FIX_CODE]` is non-terminal: resolve the conflicts, commit, push to the PR head branch, then iterate immediately with the same options.";
  if (hasShaGatedReviewMutations) {
    return "`[FIX_CODE]` is non-terminal: if you changed code, commit and push to the PR head branch, then run the review mutations using the pushed commit SHA and iterate immediately with the same options; if you did not change code, complete the authorized review mutations and iterate immediately with the same options.";
  }
  if (checks.some((check) => check.rerunCommand)) {
    return "`[FIX_CODE]` is non-terminal. Run any warranted reruns for `[rerun authorized]` checks (or apply code fixes for real failures), then iterate immediately with the same options to continue.";
  }
  return "`[FIX_CODE]` is non-terminal. After completing these steps, iterate immediately with the same options to continue.";
}
