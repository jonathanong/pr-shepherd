import { buildPrShepherdCommand } from "../cli/runner.mts";

/**
 * Build the `build-suggestion-patch` instruction step for agent consumers.
 * Currently emitted by iterate `fix_code` for suggestion review threads. The CLI keeps
 * only the trigger and the concrete command; refusal/drift handling is invariant across
 * every invocation, so it lives in the pr-shepherd skill's "Suggestion patches" playbook
 * instead of being re-emitted every tick (see CLAUDE.md "Keep skills and loop prompts
 * minimal").
 * @param sectionName - The markdown section heading where suggestion threads appear,
 *   e.g. `"## Review threads"`.
 */
export function buildCommitSuggestionInstruction(prNumber: number, sectionName: string): string {
  const command = buildPrShepherdCommand([
    "build-suggestion-patch",
    String(prNumber),
    "--thread-id",
    "<id>",
    "--message",
    "<one-sentence headline>",
    "--format=json",
  ]).text;
  return `For each thread marked \`[suggestion]\` under \`${sectionName}\`, run \`${command}\` and apply the returned patch. See "Suggestion patches" in the pr-shepherd skill for refusals and drift.`;
}
