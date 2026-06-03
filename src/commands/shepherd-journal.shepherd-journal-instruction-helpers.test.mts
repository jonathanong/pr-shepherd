import { describe, it, expect } from "vitest";
import {
  SHEPHERD_JOURNAL_FIRST_LOOK_GUIDANCE,
  SHEPHERD_JOURNAL_REFERENCE_GUIDANCE_THREADS_AND_COMMENTS_IN_ITEMS,
  SHEPHERD_JOURNAL_REFERENCE_GUIDANCE_THREADS_AND_COMMENTS_IN_ITEM_HEADINGS,
  SHEPHERD_JOURNAL_SECTION,
  SHEPHERD_JOURNAL_SECTION_PATTERN,
  buildFixInstructions,
  buildShepherdJournalInstruction,
  countMentions,
} from "../../test-helpers/commands/shepherd-journal.test-support.mts";
import type {
  AgentThread,
  ResolveCommand,
} from "../../test-helpers/commands/shepherd-journal.test-support.mts";

describe("shepherd journal instruction helpers", () => {
  it("buildShepherdJournalInstruction references the journal subcommand", () => {
    const result = buildShepherdJournalInstruction(
      42,
      SHEPHERD_JOURNAL_REFERENCE_GUIDANCE_THREADS_AND_COMMENTS_IN_ITEMS,
    );

    expect(result).toContain(SHEPHERD_JOURNAL_SECTION);
    expect(result).toContain("pr-shepherd journal 42");
    expect(result).toContain("idempotent");
    expect(countMentions(result, SHEPHERD_JOURNAL_SECTION)).toBe(1);
  });
  it("validates the Shepherd Journal section heading matcher", () => {
    expect(SHEPHERD_JOURNAL_SECTION_PATTERN.test("## Shepherd Journal")).toBe(true);
    expect(SHEPHERD_JOURNAL_SECTION_PATTERN.test("## ShepherdJouRnal")).toBe(false);
    expect(SHEPHERD_JOURNAL_SECTION_PATTERN.test("### Shepherd Journal")).toBe(false);
  });
  it("buildFixInstructions emits one append-aware Shepherd Journal step when mutations are present", () => {
    const thread: AgentThread = {
      id: "thread-1",
      path: "src/foo.ts",
      line: 10,
      author: "alice",
      authorType: "Unknown" as const,
      body: "please fix",
      url: "https://github.com/org/repo/pull/42#thread",
    };
    const resolveCommand: ResolveCommand = {
      argv: ["pr-shepherd", "resolve", "42"],
      requiresHeadSha: false,
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
          body: "Looks good overall with one suggestion.",
        },
      ],
      [],
      [],
      [],
    );

    const text = instructions.join("\n");

    expect(text).toContain(SHEPHERD_JOURNAL_SECTION);
    expect(text).toContain("pr-shepherd journal 42");
    expect(text).toContain("idempotent");
    expect(text).toContain(
      SHEPHERD_JOURNAL_REFERENCE_GUIDANCE_THREADS_AND_COMMENTS_IN_ITEM_HEADINGS,
    );
    expect(text).toContain(SHEPHERD_JOURNAL_FIRST_LOOK_GUIDANCE);
    expect(countMentions(text, SHEPHERD_JOURNAL_SECTION)).toBe(1);
    expect(text).not.toContain("`## Shepherd Journal` entry");
  });
  it("omits Shepherd Journal guidance when no mutations are required", () => {
    const resolveCommand: ResolveCommand = {
      argv: ["pr-shepherd", "resolve", "42"],
      requiresHeadSha: false,
      requiresDismissMessage: false,
      hasMutations: false,
    };

    const instructions = buildFixInstructions([], [], [], [], "main", resolveCommand, false, 42, 0);

    const text = instructions.join("\n");
    expect(text).not.toContain(SHEPHERD_JOURNAL_SECTION);
  });
});
