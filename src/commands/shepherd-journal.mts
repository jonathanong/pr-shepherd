export const SHEPHERD_JOURNAL_SECTION = "Shepherd Journal";
export const SHEPHERD_JOURNAL_SECTION_PATTERN = /^##\s+Shepherd\s+Journal$/;
export const SHEPHERD_JOURNAL_DETAILS_OPEN = "<details>";
export const SHEPHERD_JOURNAL_DETAILS_SUMMARY = "<summary>Shepherd Journal</summary>";
export const SHEPHERD_JOURNAL_DETAILS_CLOSE = "</details>";

export const SHEPHERD_JOURNAL_APPEND_HINT =
  "If Shepherd Journal details already exist, append entries inside them instead of creating another container.";

export const SHEPHERD_JOURNAL_FIRST_LOOK_GUIDANCE =
  "Review each body under `## Review summaries (first look)`. Eligible non-human IDs are already in `--minimize-comment-ids`. Record any warranted Shepherd Journal note before review mutations.";

/**
 * Build the Shepherd Journal instruction step. The reference-citation convention (link
 * threads/comments from their headings, cite reviews by ID) is invariant across every
 * invocation, so it lives in the pr-shepherd skill's "Shepherd Journal" playbook instead
 * of being re-emitted every tick (see CLAUDE.md "Keep skills and loop prompts minimal").
 */
export function buildShepherdJournalInstruction(prReference: string | number): string {
  return `For any substantial decision or rejection, append \`- <decision>\` to Shepherd Journal with \`pr-shepherd apply journal ${prReference} '- <decision>'\`. See "Shepherd Journal" in the pr-shepherd skill for citation conventions.`;
}
