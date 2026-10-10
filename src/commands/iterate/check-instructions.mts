import type { AgentCheck, ResolveCommand, Review } from "../../types.mts";
import { playbookPointer } from "../playbook-pointer.mts";

export const FIX_CODE_CONTINUATION =
  "`[FIX_CODE]` is non-terminal. Iterate immediately with the same options.";

/** Build the stale-CR clause appended to the `## Changes-requested reviews` instruction. */
export function buildCrStaleClause(reviews: Review[]): string {
  const human = reviews.some((r) => r.staleReview && !r.staleBotCr)
    ? " `[stale]` bullets are human CRs on an old commit. Ask the reviewer to re-review."
    : "";
  return human;
}

/**
 * Build the optional branch-update hint. Empty unless the branch is behind or conflicts with its
 * base and the user configured a non-blank `iterate.behindBaseHint` — the CLI never prescribes
 * rebase/merge mechanics itself (see "Keep skills and loop prompts minimal" in AGENTS.md); this
 * only echoes back the caller's own configured pointer. `hint` is trimmed and type-checked at the
 * point of use (rather than at config load) so a malformed rc file value (non-string, or
 * whitespace-only) degrades to "no hint" instead of rendering garbage into agent-facing text or
 * discarding the rest of the user's config.
 */
export function buildBehindBaseHintInstruction(
  baseBranch: string,
  hint: string,
  branch: { isBehind: boolean; hasConflicts: boolean },
): string[] {
  const trimmedHint = typeof hint === "string" ? hint.trim() : "";
  if ((!branch.isBehind && !branch.hasConflicts) || trimmedHint === "") return [];
  const state = branch.hasConflicts ? "conflicts with" : "is behind";
  return [`The branch ${state} PR base branch \`${baseBranch}\`. ${trimmedHint} before pushing.`];
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
  stackRebase?: string,
): string[] {
  if (!hasExhaustedWorkflowRerun || (!branch.isBehind && !branch.hasConflicts)) return [];

  const state = branch.hasConflicts ? "conflicts with" : "is behind";
  const instructions = [
    `The workflow rerun still fails while the branch ${state} PR base branch \`${baseBranch}\`. Inspect the current base branch for an existing fix before choosing a remediation.`,
  ];
  instructions.push(
    stackRebase ??
      (branch.hasConflicts
        ? `Rebase or otherwise update the PR branch from \`${baseBranch}\` according to repository conventions, resolving conflicts as part of that update.`
        : `Rebase or otherwise update the PR branch from \`${baseBranch}\` according to repository conventions.`),
  );
  return instructions;
}

/**
 * Build the `Run the apply review: command` instruction. Steps stay here (not in the skill)
 * whenever the *unmodified, as-printed* command is unsafe without them:
 *
 * - `$HEAD_SHA`/`$DISMISS_MESSAGE` substitution: without it, the printed command has an
 *   empty `--message`/invalid `--require-sha` and `apply review` rejects the mutation.
 * Contrast with what *does* stay in the skill's "Review-mutation mechanics" playbook —
 * dismiss-ID retention. The pointer below is load-bearing: without it, nothing in CLI output
 * tells the agent that playbook exists.
 */
export function buildResolveCommandInstruction(resolveCommand: ResolveCommand): string[] {
  if (!resolveCommand.hasMutations) return [];
  const instructions: string[] = [];
  if (resolveCommand.requiresHeadSha) {
    instructions.push(
      "If you did not change code, replace `$HEAD_SHA` with `$(git rev-parse HEAD)` (it must equal the remote PR head). If you did, use the pushed SHA.",
    );
  }
  if (resolveCommand.requiresDismissMessage) {
    instructions.push("Replace `$DISMISS_MESSAGE` with one sentence describing what changed.");
  }
  instructions.push(
    `Run the \`apply review:\` command above. ${playbookPointer("Review-mutation mechanics")}`,
  );
  return instructions;
}

/** One pointer. Conclusion, rerun, and bare-check rules live in the CI playbook. */
export function buildFailingCheckInstructions(checks: AgentCheck[]): string[] {
  if (checks.length === 0) return [];
  return [`Triage \`## Failing checks\`. ${playbookPointer("CI failure triage")}`];
}

/** Update the PR branch after an external blocker merges or closes. Never rerun that job. */
export function buildReleasedBlockerInstruction(prNumber: number): string {
  return getGithubTransport() === "rest"
    ? "Update this PR branch from its base using the repository's branch-update procedure. Do not rerun the job; a rerun retests the old merge ref."
    : `Update this PR branch from its base with \`gh pr update-branch ${prNumber} --rebase\`. Do not rerun the job; a rerun retests the old merge ref.`;
}

/** Recurrence only. Commit, push, rerun, and SHA steps are earlier instructions. */
export function buildFixCompletionInstruction(): string {
  return FIX_CODE_CONTINUATION;
}
import { getGithubTransport } from "../../github/transport.mts";
