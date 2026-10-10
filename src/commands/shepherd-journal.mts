import { buildPrShepherdCommand } from "../cli/runner.mts";

export const SHEPHERD_JOURNAL_SECTION = "Shepherd Journal";
export const SHEPHERD_JOURNAL_SECTION_PATTERN = /^##\s+Shepherd\s+Journal$/;
export const SHEPHERD_JOURNAL_DETAILS_OPEN = "<details>";
export const SHEPHERD_JOURNAL_DETAILS_SUMMARY = "<summary>Shepherd Journal</summary>";
export const SHEPHERD_JOURNAL_DETAILS_CLOSE = "</details>";

export const SHEPHERD_JOURNAL_APPEND_HINT =
  "If Shepherd Journal details already exist, append entries inside them instead of creating another container.";

export const SHEPHERD_JOURNAL_FIRST_LOOK_GUIDANCE = `Read each body under \`## Review summaries (first look)\` and journal any warranted note before review mutations.`;

/** The concrete `apply journal` command. The placeholder is single-quoted so a substituted decision stays literal in the shell. */
export function buildShepherdJournalCommand(prReference: string | number): string {
  return `${buildPrShepherdCommand(["apply", "journal", String(prReference)]).text} '- <decision>'`;
}

/**
 * Build the Shepherd Journal instruction step. The reference-citation convention (link
 * threads/comments by heading URL, cite reviews by ID) is a short clause, so it stays inline:
 * a separate playbook would cost the agent an extra read turn that outweighs the clause.
 */
export function buildShepherdJournalInstruction(prReference: string | number): string {
  const command = buildShepherdJournalCommand(prReference);
  return `For any substantial decision or rejection, add a Shepherd Journal entry with \`${command}\`, linking threads and comments by heading URL and citing reviews by ID.`;
}
