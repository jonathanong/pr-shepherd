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

/** Build the `Run the apply review: command` instruction, including its optional substitution hint. */
export function buildResolveCommandInstruction(resolveCommand: ResolveCommand): string[] {
  if (!resolveCommand.hasMutations) return [];
  const instructions: string[] = [];
  if ((resolveCommand.replyThreadIds?.length ?? 0) > 0) {
    instructions.push(
      "Before `apply review:`, remove any `--reply-thread-ids` entry whose latest visible comment is your own Shepherd reply. Do not reply to yourself.",
    );
  }
  if (resolveCommand.requiresHeadSha) {
    instructions.push(
      "Replace `$HEAD_SHA` with the pushed commit SHA, or `$(git rev-parse HEAD)` if you did not push.",
    );
  }
  if (resolveCommand.requiresDismissMessage) {
    instructions.push("Replace `$DISMISS_MESSAGE` with one sentence describing what changed.");
  }
  instructions.push("Run the `apply review:` command shown above.");
  return instructions;
}

export function buildFailingCheckInstructions(checks: AgentCheck[]): string[] {
  if (checks.length === 0) return [];
  const hasRunId = checks.some(
    (c) => c.runId && c.conclusion !== "CANCELLED" && c.conclusion !== "STARTUP_FAILURE",
  );
  const hasCancelled = checks.some((c) => c.runId && c.conclusion === "CANCELLED");
  const hasStartupFailure = checks.some((c) => c.runId && c.conclusion === "STARTUP_FAILURE");
  const hasExternal = checks.some((c) => !c.runId && c.detailsUrl);
  const hasBare = checks.some((c) => !c.runId && !c.detailsUrl);

  const instructions: string[] = [];
  if (hasRunId) {
    instructions.push(
      "For each GitHub Actions failure under `## Failing checks`, read the included log excerpt first.",
      "If the excerpt is insufficient, run `gh run view <runId> --log-failed`. Open the run URL only if the API still lacks detail.",
      "Rerun transient infrastructure failures with `gh run rerun <runId> --failed`. Apply a code fix for real test or build failures.",
    );
  }
  if (hasCancelled) {
    instructions.push(
      "For each `[conclusion: CANCELLED]` failure, run `gh run rerun <runId>` unless this tick will push new commits.",
      "Do not treat a cancelled failure as resolved. `## Cancelled runs` is a different section.",
    );
  }
  if (hasStartupFailure) {
    instructions.push(
      "For each `[conclusion: STARTUP_FAILURE]` failure, inspect it with `gh run view <runId>` and rerun it with `gh run rerun <runId>` if warranted.",
    );
  }
  if (hasExternal) {
    instructions.push("For each `external` failure, open its URL and inspect it.");
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
  return "`[FIX_CODE]` is non-terminal. After completing these steps, continue with the next poll using the same interface and mode: rerun the current `pr-shepherd` CLI invocation with its flags, or call MCP `iterate` again.";
}
