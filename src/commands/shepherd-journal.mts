export const SHEPHERD_JOURNAL_SECTION = "## Shepherd Journal";
export const SHEPHERD_JOURNAL_SECTION_PATTERN = /^##\s+Shepherd\s+Journal$/;

export const SHEPHERD_JOURNAL_APPEND_HINT =
  "If this section already exists, append your entries under it instead of creating a duplicate heading.";

export const SHEPHERD_JOURNAL_FIRST_LOOK_GUIDANCE =
  "Review the bodies shown under `## Review summaries (first look)` — you are seeing these for the first time. Any IDs eligible for minimization are already included in the resolve command's `--minimize-comment-ids`; if any warrants a Shepherd Journal note, append it before running resolve.";

export function buildShepherdJournalInstruction(
  prNumber: number,
  itemReferenceGuidance: string,
): string {
  return [
    `For any large decisions or rejections you made this iteration, add or update a \`${SHEPHERD_JOURNAL_SECTION}\` section in the PR description (\`gh pr edit ${prNumber} --body …\`) summarizing each decision.`,
    itemReferenceGuidance,
    SHEPHERD_JOURNAL_APPEND_HINT,
  ].join(" ");
}

export const SHEPHERD_JOURNAL_REFERENCE_GUIDANCE_THREADS_AND_COMMENTS_IN_ITEM_HEADINGS =
  "For threads and comments, use the markdown link shown in its heading above; for reviews, reference the review ID.";

export const SHEPHERD_JOURNAL_REFERENCE_GUIDANCE_THREADS_AND_COMMENTS_IN_ITEMS =
  "For threads and comments, use the markdown link shown in each item's bullet above; for reviews, reference the review ID.";
