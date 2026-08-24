import { buildPrShepherdCommand } from "../cli/runner.mts";

/**
 * Build the `build-suggestion-patch` instruction step for agent consumers.
 * Currently emitted by iterate `fix_code` for suggestion review threads.
 * @param sectionName - The markdown section heading where suggestion threads appear,
 *   e.g. `"## Review threads"`.
 * @param includeDriftHint - Whether to add the trailing note about drift on failed apply.
 */
export function buildCommitSuggestionInstruction(
  prNumber: number,
  sectionName: string,
  includeDriftHint: boolean,
): string[] {
  const command = buildPrShepherdCommand([
    "build-suggestion-patch",
    String(prNumber),
    "--thread-id",
    "<id>",
    "--message",
    "<one-sentence headline>",
    "--format=json",
  ]).text;
  const driftHint = includeDriftHint
    ? "If the patch does not apply because the suggestion drifted, use the manual-fix step below. Do not retry the command."
    : "If the patch does not apply, use the manual-edit step below. Do not retry the command.";
  const manualStep = includeDriftHint ? "manual-fix step" : "manual-edit step";
  return [
    `For each thread marked \`[suggestion]\` under \`${sectionName}\`, run \`${command}\` to retrieve its patch and suggested commit.`,
    "The CLI only builds the patch. Apply it, stage the listed file, and follow the returned commit instructions.",
    `If the command refuses for any reason, including an unsafe anchored range or nested/unbalanced suggestion fences, skip patch application and use the ${manualStep} below. Do not retry the command.`,
    driftHint,
    "Keep human-authored thread IDs in `apply review:` so Shepherd replies instead of resolving them.",
  ];
}
