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
 * Build the `Run the apply review: command` instruction. Placeholder substitution
 * ($HEAD_SHA, $DISMISS_MESSAGE), the self-reply exclusion rule, and — highest-severity —
 * retaining every existing `--dismiss-review-ids` ID (omitting one leaves the PR stuck in
 * `CHANGES_REQUESTED`) are invariant across every invocation, so they live in the
 * pr-shepherd skill's "Review-mutation mechanics" playbook instead of being re-emitted
 * every tick (see CLAUDE.md "Keep skills and loop prompts minimal"). The pointer below is
 * load-bearing: without it, nothing in CLI output tells the agent that playbook exists.
 */
export function buildResolveCommandInstruction(resolveCommand: ResolveCommand): string[] {
  if (!resolveCommand.hasMutations) return [];
  return [
    'Run the `apply review:` command shown above. See "Review-mutation mechanics" in the pr-shepherd skill for placeholder substitution and ID-retention rules.',
  ];
}

/**
 * Build the CI-triage instruction. The per-conclusion rerun policy (GitHub Actions log
 * excerpts, `gh run view`/`gh run rerun` rules for CANCELLED/STARTUP_FAILURE/external
 * failures) is invariant text keyed on the `[conclusion: …]` tags already rendered in
 * `## Failing checks` — it lives in the pr-shepherd skill's "CI failure triage" playbook
 * instead of being re-emitted every tick. This supersedes the "CI budget rules" example in
 * CLAUDE.md's "Keep skills and loop prompts minimal" section (see that section's amendment
 * note). The `(no runId)` case stays here because it flips `buildFixCompletionInstruction`
 * to a human-handoff terminal state — that trigger, unlike the others, is CLI-decided.
 */
export function buildFailingCheckInstructions(checks: AgentCheck[]): string[] {
  if (checks.length === 0) return [];
  const hasBare = checks.some((c) => !c.runId && !c.detailsUrl);
  const hasTriageable = checks.some((c) => c.runId || c.detailsUrl);

  const instructions: string[] = [];
  if (hasTriageable) {
    instructions.push(
      'Triage every failure under `## Failing checks` — read its included log excerpt first. See "CI failure triage" in the pr-shepherd skill for `gh run view` / `gh run rerun` rules.',
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
  return "`[FIX_CODE]` is non-terminal. After completing these steps, rerun this command to continue.";
}
