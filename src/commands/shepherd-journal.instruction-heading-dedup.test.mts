import { describe, it, expect } from "vitest";
import {
  SHEPHERD_JOURNAL_APPEND_HINT,
  SHEPHERD_JOURNAL_FIRST_LOOK_GUIDANCE,
  SHEPHERD_JOURNAL_REFERENCE_GUIDANCE_THREADS_AND_COMMENTS_IN_ITEMS,
  SHEPHERD_JOURNAL_REFERENCE_GUIDANCE_THREADS_AND_COMMENTS_IN_ITEM_HEADINGS,
  SHEPHERD_JOURNAL_SECTION,
  buildFixInstructions,
  buildShepherdJournalInstruction,
  countMentions,
} from "../../test-helpers/commands/shepherd-journal.test-support.mts";
import type {
  AgentThread,
  ResolveCommand,
} from "../../test-helpers/commands/shepherd-journal.test-support.mts";

describe("shepherd journal instruction helpers", () => {
  it("does not duplicate Shepherd Journal heading when first-look summaries are present", () => {
    const thread: AgentThread = {
      id: "thread-1",
      path: "src/foo.ts",
      line: 10,
      author: "alice",
      authorType: "Unknown" as const,
      body: "fix with summary",
      url: "https://github.com/org/repo/pull/42#thread",
    };
    const resolveCommand: ResolveCommand = {
      argv: ["pr-shepherd", "resolve", "42"],
      requiresHeadSha: true,
      requiresDismissMessage: false,
      hasMutations: true,
    };

    const instructions = buildFixInstructions(
      [thread],
      [],
      [],
      [],
      "main",
      resolveCommand,
      false,
      42,
      0,
      [],
      [],
      [
        {
          id: "PRR_1",
          author: "reviewer",
          authorType: "Unknown" as const,
          body: "New first-look summary.",
        },
      ],
      [],
      [],
      [],
    );

    const text = instructions.join("\n");
    expect(text).toContain(SHEPHERD_JOURNAL_SECTION);
    expect(text).toContain(SHEPHERD_JOURNAL_FIRST_LOOK_GUIDANCE);
    expect(text).toContain(SHEPHERD_JOURNAL_APPEND_HINT);
    expect(text).toContain(
      SHEPHERD_JOURNAL_REFERENCE_GUIDANCE_THREADS_AND_COMMENTS_IN_ITEM_HEADINGS,
    );
    expect(countMentions(text, SHEPHERD_JOURNAL_SECTION)).toBe(1);
  });
  it("buildShepherdJournalInstruction remains de-duped when reused across multiple instruction blocks", () => {
    const first = buildShepherdJournalInstruction(
      42,
      SHEPHERD_JOURNAL_REFERENCE_GUIDANCE_THREADS_AND_COMMENTS_IN_ITEMS,
    );
    const second = buildShepherdJournalInstruction(
      42,
      SHEPHERD_JOURNAL_REFERENCE_GUIDANCE_THREADS_AND_COMMENTS_IN_ITEM_HEADINGS,
    );
    const merged = `${first}\n---\n${second}`;
    const total = countMentions(merged, SHEPHERD_JOURNAL_SECTION);
    expect(total).toBe(2);
    expect(first).not.toContain("`## Shepherd Journal` entry");
    expect(second).not.toContain("`## Shepherd Journal` entry");
  });
});
