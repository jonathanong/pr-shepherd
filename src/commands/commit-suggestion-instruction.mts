import { buildPrShepherdCommand } from "../cli/runner.mts";

/**
 * Build the `commit-suggestion` instruction step for agent consumers.
 * Shared between `fix_code` (iterate) and `resolve --fetch` paths.
 * @param sectionName - The markdown section heading where suggestion threads appear
 *   (e.g. `"## Review threads"` for iterate, `"## Actionable Review Threads"` for resolve).
 * @param includeDriftHint - Whether to add the trailing note about drift on failed apply.
 */
export function buildCommitSuggestionInstruction(
  prNumber: number,
  sectionName: string,
  includeDriftHint: boolean,
): string {
  const command = buildPrShepherdCommand([
    "commit-suggestion",
    String(prNumber),
    "--thread-id",
    "<id>",
    "--message",
    "<one-sentence headline>",
    "--format=json",
  ]).text;
  const driftHint = includeDriftHint
    ? " If the patch fails to apply (drift since the suggestion was written), fall through to the manual fix step."
    : " If the patch fails to apply, fall through to the manual-edit step.";
  return `For each thread marked \`[suggestion]\` under \`${sectionName}\`: run \`${command}\` to retrieve the patch and suggested commit. The CLI does not mutate the working tree — apply the patch yourself (run \`git apply\` with the diff shown, or edit the file directly using the line range), then stage the listed file and run the suggested \`git commit\` from the \`## Instructions\` section. Human-authored thread IDs are replied to by the resolve command below; Shepherd does not auto-resolve them.${driftHint} Do not retry the same command.`;
}
