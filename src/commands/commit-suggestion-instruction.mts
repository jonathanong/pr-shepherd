import { buildPrShepherdCommand } from "../cli/runner.mts";
import { playbookPointer } from "./playbook-pointer.mts";

/**
 * Build the `build-suggestion-patches` instruction step for agent consumers.
 * Currently emitted by iterate `fix_code` for suggestion review threads. The CLI keeps
 * only the trigger and the concrete command; refusal/drift handling is invariant across
 * every invocation, so it lives in the pr-shepherd skill's "Suggestion patches" playbook
 * instead of being re-emitted every tick (see AGENTS.md "Keep skills and loop prompts
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
  return `For every \`[suggestion]\` thread under \`${sectionName}\`, run one \`${command}\`, repeating \`--thread-id\` and \`--message\` in displayed order. ${playbookPointer("Suggestion patches")}`;
}
