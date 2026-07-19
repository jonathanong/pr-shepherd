import type { AgentCheck, ResolveCommand, Review } from "../../types.mts";

/** Build the stale-CR clause appended to the `## Changes-requested reviews` instruction. */
export function buildCrStaleClause(reviews: Review[]): string {
  const bot = reviews.some((r) => r.staleBotCr)
    ? " `[pending dismissal — already surfaced]` bullets are bot CRs from a prior tick."
    : "";
  const human = reviews.some((r) => r.staleReview && !r.staleBotCr)
    ? " `[stale]` bullets are human CRs on an old commit; ask reviewer to re-review."
    : "";
  return bot + human;
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
  return [`The branch is behind \`origin/${baseBranch}\` — ${trimmedHint} before pushing.`];
}

/** Build the `Run the resolve: command` instruction, including its optional substitution hint. */
export function buildResolveCommandInstruction(resolveCommand: ResolveCommand): string[] {
  if (!resolveCommand.hasMutations) return [];
  const instructions: string[] = [];
  if ((resolveCommand.replyThreadIds?.length ?? 0) > 0) {
    instructions.push(
      `Before running the \`resolve:\` command, remove any thread from \`--reply-thread-ids\` if the latest visible comment in that thread is your own prior Shepherd reply. Do not reply to your own comments.`,
    );
  }
  const substituteParts: string[] = [];
  if (resolveCommand.requiresHeadSha) {
    substituteParts.push(
      `\`$HEAD_SHA\` with the pushed commit SHA (or \`$(git rev-parse HEAD)\` if you did not push)`,
    );
  }
  if (resolveCommand.requiresDismissMessage) {
    substituteParts.push(
      `\`$DISMISS_MESSAGE\` with a one-sentence reply/description of what you changed`,
    );
  }
  const substituteHint =
    substituteParts.length > 0 ? `, substituting ${substituteParts.join(" and ")}` : "";
  instructions.push(`Run the \`resolve:\` command shown above${substituteHint}.`);
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

  const parts: string[] = [];
  if (hasRunId) {
    parts.push(
      "read any included log excerpt first; fetch the full log with `gh run view <runId> --log-failed` when the excerpt is insufficient; decide whether to rerun with `gh run rerun <runId> --failed` for transient infrastructure failures (network timeout, OOM kill, runner crash), or apply a code fix for real test/build failures; if GitHub omits workflow-evaluation details from API/log output, open the run URL in the GitHub UI",
    );
  }
  if (hasCancelled) {
    parts.push(
      "for `[conclusion: CANCELLED]` entries: these are not concurrency-superseded (superseded CANCELLED checks are excluded from this section and reported under `**superseded**` instead) — rerun with `gh run rerun <runId>` unless you are already pushing new commits this tick for other reasons, in which case the fresh run naturally supersedes it; do not silently treat a required CANCELLED check as resolved — do NOT confuse with IDs under `## Cancelled runs`",
    );
  }
  if (hasStartupFailure) {
    parts.push(
      "for `[conclusion: STARTUP_FAILURE]` entries: inspect with `gh run view <runId>` and rerun with `gh run rerun <runId>` if the workflow should be retried",
    );
  }
  if (hasExternal) {
    parts.push("for `external` entries (no run ID, has URL): open the URL to inspect the failure");
  }
  if (hasBare) {
    parts.push(
      "for `(no runId)` entries: no log or URL is available — escalate to a human for manual investigation",
    );
  }

  return [`For each failing check under \`## Failing checks\`: ${parts.join("; ")}.`];
}
