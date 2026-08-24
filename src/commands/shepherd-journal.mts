export const SHEPHERD_JOURNAL_SECTION = "## Shepherd Journal";
export const SHEPHERD_JOURNAL_SECTION_PATTERN = /^##\s+Shepherd\s+Journal$/;

export const SHEPHERD_JOURNAL_APPEND_HINT =
  "If this section already exists, append your entries under it instead of creating a duplicate heading.";

export const SHEPHERD_JOURNAL_FIRST_LOOK_GUIDANCE =
  "Review each body under `## Review summaries (first look)`. Eligible non-human IDs are already in `--minimize-comment-ids`. Record any warranted Shepherd Journal note before review mutations.";

export function buildShepherdJournalInstruction(
  prNumber: number,
  itemReferenceGuidance: string,
): string[] {
  return [
    `For any substantial decision or rejection, append \`- <decision>\` to \`${SHEPHERD_JOURNAL_SECTION}\` with \`pr-shepherd apply journal ${prNumber} '- <decision>'\`.`,
    itemReferenceGuidance,
  ];
}

export const SHEPHERD_JOURNAL_REFERENCE_GUIDANCE_THREADS_AND_COMMENTS_IN_ITEM_HEADINGS =
  "Link threads and comments from their headings. Cite reviews by ID.";

export const SHEPHERD_JOURNAL_REFERENCE_GUIDANCE_THREADS_AND_COMMENTS_IN_ITEMS =
  "Link threads and comments from their item bullets. Cite reviews by ID.";
