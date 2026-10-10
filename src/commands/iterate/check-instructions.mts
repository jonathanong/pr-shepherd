import type { AgentCheck, ResolveCommand, Review } from "../../types.mts";
import { playbookPointer } from "../playbook-pointer.mts";

const FIX_CODE_CONTINUATION = "`[FIX_CODE]` is non-terminal. Rerun the same command now.";

/** The `[FIX_CODE]` recurrence step, whether plain or rewritten by the quota warning. */
export function isFixCodeContinuation(step: string): boolean {
  return /\[FIX_CODE\].*non-terminal/i.test(step);
}

/** Build the stale-CR step for `## Changes-requested reviews`. Empty when no human CR is stale. */
export function buildCrStaleClause(reviews: Review[]): string {
  return reviews.some((r) => r.staleReview && !r.staleBotCr)
    ? "`[stale]` changes-requested reviews are human CRs on an old commit. Ask the reviewer to re-review."
    : "";
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
 * Build the `apply review` step, with the rendered command inline. The step stays here (not in
 * the skill) because the *as-printed* command is invalid without `$DISMISS_MESSAGE`: an empty
 * `--message` makes `apply review` reject the mutation. `--require-sha` needs no substitution:
 * the rendered command reads the pushed HEAD itself. "Even if you changed no code": the
 * command records each item's disposition either way.
 */
export function buildResolveCommandInstruction(
  resolveCommand: ResolveCommand,
  rendered: string,
): string[] {
  if (!resolveCommand.hasMutations) return [];
  if (resolveCommand.requiresDismissMessage) {
    return [
      `Set \`$DISMISS_MESSAGE\` to one sentence on what changed and run, even if no code changed: \`${rendered}\``,
    ];
  }
  return [`Run, even if no code changed: \`${rendered}\``];
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
