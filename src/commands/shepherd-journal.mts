export const SHEPHERD_JOURNAL_SECTION = "## Shepherd Journal";
export const SHEPHERD_JOURNAL_SECTION_PATTERN = /^##\s+Shepherd\s+Journal$/;

export const SHEPHERD_JOURNAL_APPEND_HINT =
  "If this section already exists, append your entries under it instead of creating a duplicate heading.";

export const SHEPHERD_JOURNAL_FIRST_LOOK_GUIDANCE =
  "Review the bodies shown under `## Review summaries (first look)` — you are seeing these for the first time. Eligible non-human IDs, when present, are already included in `--minimize-comment-ids` in the resolve or resolve-only command above; if any warrants a Shepherd Journal note, append it before running resolve.";

export function buildShepherdJournalInstruction(
  prNumber: number,
  itemReferenceGuidance: string,
): string {
  return [
    `For any large decisions or rejections you made this iteration, run \`npx pr-shepherd journal ${prNumber} '- <decision>'\` to append an entry to the \`${SHEPHERD_JOURNAL_SECTION}\` section.`,
    itemReferenceGuidance,
    `The command is idempotent — re-running with the same text is a no-op.`,
  ].join(" ");
}

export const SHEPHERD_JOURNAL_REFERENCE_GUIDANCE_THREADS_AND_COMMENTS_IN_ITEM_HEADINGS =
  "For threads and comments, use the markdown link shown in its heading above; for reviews, reference the review ID.";

export const SHEPHERD_JOURNAL_REFERENCE_GUIDANCE_THREADS_AND_COMMENTS_IN_ITEMS =
  "For threads and comments, use the markdown link shown in each item's bullet above; for reviews, reference the review ID.";
