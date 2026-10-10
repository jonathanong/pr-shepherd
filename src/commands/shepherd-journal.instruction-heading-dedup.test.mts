import { describe, it, expect } from "vitest";
import {
  SHEPHERD_JOURNAL_FIRST_LOOK_GUIDANCE,
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
      undefined,
      "",
      false,
      true,
      false,
      undefined,
      undefined,
      "inline",
    );

    const text = instructions.join("\n");
    expect(text).not.toContain(`## ${SHEPHERD_JOURNAL_SECTION}`);
    expect(text).toContain(SHEPHERD_JOURNAL_FIRST_LOOK_GUIDANCE);
    expect(text).toContain("pr-shepherd apply journal 42");
    expect(text).not.toContain("idempotent");
    // The citation convention is a short inline clause, not a separate playbook read.
    expect(text).toContain("citing item URLs or review IDs");
    expect(countMentions(text, "Journal substantial decisions")).toBe(1);
  });
  it("buildShepherdJournalInstruction remains de-duped when reused across multiple instruction blocks", () => {
    const first = buildShepherdJournalInstruction(42);
    const second = buildShepherdJournalInstruction(42);
    const merged = `${first}\n---\n${second}`;
    // Each call emits one journal step — 2 total across two independent calls.
    // What this test guards is that reusing the function doesn't fabricate an extra
    // "## Shepherd Journal" markdown heading of its own.
    expect(countMentions(merged, "Journal substantial decisions")).toBe(2);
    expect(merged).not.toContain(`## ${SHEPHERD_JOURNAL_SECTION}`);
    expect(first).not.toContain("`## Shepherd Journal` entry");
    expect(second).not.toContain("`## Shepherd Journal` entry");
  });
});
