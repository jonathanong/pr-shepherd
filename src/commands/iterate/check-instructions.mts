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
  return [`The branch is behind \`origin/${baseBranch}\`. ${trimmedHint} before pushing.`];
}

/**
 * Build the `Run the apply review: command` instruction. `$HEAD_SHA`/`$DISMISS_MESSAGE`
 * substitution stays here (not in the skill) because the printed command is not
 * independently runnable without it: a standalone CLI caller that copies the command
 * verbatim, with these placeholders unset, has an empty `--message`/invalid `--require-sha`
 * and `apply review` rejects the mutation. The self-reply exclusion rule and — highest
 * severity — retaining every existing `--dismiss-review-ids` ID (omitting one leaves the PR
 * stuck in `CHANGES_REQUESTED`) do not affect whether the printed command itself is valid,
 * so those stay invariant text in the pr-shepherd skill's "Review-mutation mechanics"
 * playbook instead of being re-emitted every tick (see CLAUDE.md "Keep skills and loop
 * prompts minimal"). The pointer below is load-bearing: without it, nothing in CLI output
 * tells the agent that playbook exists.
 */
export function buildResolveCommandInstruction(resolveCommand: ResolveCommand): string[] {
  if (!resolveCommand.hasMutations) return [];
  const instructions: string[] = [];
  if (resolveCommand.requiresHeadSha) {
    instructions.push(
      "Replace `$HEAD_SHA` with the pushed commit SHA, or `$(git rev-parse HEAD)` if you did not push.",
    );
  }
  if (resolveCommand.requiresDismissMessage) {
    instructions.push("Replace `$DISMISS_MESSAGE` with one sentence describing what changed.");
  }
  instructions.push(
    'Run the `apply review:` command shown above. See "Review-mutation mechanics" in the pr-shepherd skill for the self-reply exclusion rule and dismiss-ID retention.',
  );
  return instructions;
}

/**
 * Build the CI-triage instruction. The per-conclusion rerun policy (GitHub Actions log
 * excerpts, `gh run view`/`gh run rerun` rules for CANCELLED/STARTUP_FAILURE/external
 * failures) is invariant text keyed on the `[conclusion: …]` tags already rendered in
 * `## Failing checks` — it lives in the pr-shepherd skill's "CI failure triage" playbook
 * instead of being re-emitted every tick. This supersedes the "CI budget rules" example in
 * CLAUDE.md's "Keep skills and loop prompts minimal" section (see that section's amendment
 * note). The `(no runId)` case stays here because it flips `buildFixCompletionInstruction`
 * to a human-handoff terminal state — that trigger, unlike the others, is CLI-decided. The
 * CLI sentence does not claim every failure has a log excerpt to read (only GitHub Actions
 * checks with a runId do — CANCELLED, STARTUP_FAILURE, and external checks may not); that
 * per-kind detail is exactly what the skill playbook table disambiguates.
 */
export function buildFailingCheckInstructions(checks: AgentCheck[]): string[] {
  if (checks.length === 0) return [];
  const hasBare = checks.some((c) => !c.runId && !c.detailsUrl);
  const hasTriageable = checks.some((c) => c.runId || c.detailsUrl);

  const instructions: string[] = [];
  if (hasTriageable) {
    instructions.push(
      'Triage every failure under `## Failing checks`. See "CI failure triage" in the pr-shepherd skill for `gh run view` / `gh run rerun` rules.',
    );
  }
  if (hasBare) {
    instructions.push(
      "For each `(no runId)` failure, escalate to a human because no log or URL is available.",
    );
  }

  return instructions;
}

export function buildFixCompletionInstruction(checks: AgentCheck[]): string {
  const requiresHumanHandoff = checks.some((check) => !check.runId && !check.detailsUrl);
  if (requiresHumanHandoff) {
    return "`[FIX_CODE]` requires a human handoff for an uninspectable failing check. Stop polling after escalating, and resume only after human direction.";
  }
  return "`[FIX_CODE]` is non-terminal. After completing these steps, iterate again to continue.";
}
