import {
  buildShepherdJournalInstruction,
  SHEPHERD_JOURNAL_APPEND_HINT,
  SHEPHERD_JOURNAL_FIRST_LOOK_GUIDANCE,
  SHEPHERD_JOURNAL_REFERENCE_GUIDANCE_THREADS_AND_COMMENTS_IN_ITEM_HEADINGS,
  SHEPHERD_JOURNAL_REFERENCE_GUIDANCE_THREADS_AND_COMMENTS_IN_ITEMS,
  SHEPHERD_JOURNAL_SECTION,
  SHEPHERD_JOURNAL_SECTION_PATTERN,
} from "../../src/commands/shepherd-journal.mts";
import { buildFixInstructions } from "../../src/commands/iterate/render.mts";

function countMentions(text: string, phrase: string): number {
  return (text.match(new RegExp(phrase, "g")) ?? []).length;
}

export {
  SHEPHERD_JOURNAL_APPEND_HINT,
  SHEPHERD_JOURNAL_FIRST_LOOK_GUIDANCE,
  SHEPHERD_JOURNAL_REFERENCE_GUIDANCE_THREADS_AND_COMMENTS_IN_ITEMS,
  SHEPHERD_JOURNAL_REFERENCE_GUIDANCE_THREADS_AND_COMMENTS_IN_ITEM_HEADINGS,
  SHEPHERD_JOURNAL_SECTION,
  SHEPHERD_JOURNAL_SECTION_PATTERN,
  buildFixInstructions,
  buildShepherdJournalInstruction,
  countMentions,
};
export type { AgentThread, ResolveCommand } from "../../src/types.mts";
