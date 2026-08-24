export const SHEPHERD_JOURNAL_SECTION = "Shepherd Journal";
export const SHEPHERD_JOURNAL_SECTION_PATTERN = /^##\s+Shepherd\s+Journal$/;
export const SHEPHERD_JOURNAL_DETAILS_OPEN = "<details>";
export const SHEPHERD_JOURNAL_DETAILS_SUMMARY = "<summary>Shepherd Journal</summary>";
export const SHEPHERD_JOURNAL_DETAILS_CLOSE = "</details>";

export const SHEPHERD_JOURNAL_APPEND_HINT =
  "If Shepherd Journal details already exist, append entries inside them instead of creating another container.";

export const SHEPHERD_JOURNAL_FIRST_LOOK_GUIDANCE =
  "Review each body under `## Review summaries (first look)`. Eligible non-human IDs are already in `--minimize-comment-ids`. Record any warranted Shepherd Journal note before review mutations.";

export function buildShepherdJournalInstruction(
  prNumber: number,
  itemReferenceGuidance: string,
): string[] {
  return [
    `For any substantial decision or rejection, append \`- <decision>\` to Shepherd Journal with \`pr-shepherd apply journal ${prNumber} '- <decision>'\`.`,
    itemReferenceGuidance,
  ];
}

export const SHEPHERD_JOURNAL_REFERENCE_GUIDANCE_THREADS_AND_COMMENTS_IN_ITEM_HEADINGS =
  "Link threads and comments from their headings. Cite reviews by ID.";

export const SHEPHERD_JOURNAL_REFERENCE_GUIDANCE_THREADS_AND_COMMENTS_IN_ITEMS =
  "Link threads and comments from their item bullets. Cite reviews by ID.";
