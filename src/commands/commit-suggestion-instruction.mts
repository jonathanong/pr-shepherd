import { buildPrShepherdCommand } from "../cli/runner.mts";

/**
 * Build the `build-suggestion-patches` instruction step for agent consumers.
 * Currently emitted by iterate `fix_code` for suggestion review threads. The CLI keeps
 * only the trigger and the concrete command; refusal/drift handling is invariant across
 * every invocation, so it lives in the pr-shepherd skill's "Suggestion patches" playbook
 * instead of being re-emitted every tick (see CLAUDE.md "Keep skills and loop prompts
 * minimal").
 * @param sectionName - The markdown section heading where suggestion threads appear,
 *   e.g. `"## Review threads"`.
 */
export function buildCommitSuggestionInstruction(
  prReference: string | number,
  sectionName: string,
): string {
  const command = buildPrShepherdCommand([
    "build-suggestion-patches",
    String(prReference),
    "--thread-id",
    "<id>",
    "--message",
    "<one-sentence headline>",
    "--format=json",
  ]).text;
  return `For all threads marked \`[suggestion]\` under \`${sectionName}\`, run one \`${command}\` command, repeating the \`--thread-id <id> --message <one-sentence headline>\` group in displayed order, then apply the returned patches in order. See "Suggestion patches" in the pr-shepherd skill for refusals and drift.`;
}
