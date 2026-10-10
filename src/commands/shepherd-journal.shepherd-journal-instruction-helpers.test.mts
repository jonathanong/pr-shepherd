import { describe, it, expect } from "vitest";
import {
  SHEPHERD_JOURNAL_FIRST_LOOK_GUIDANCE,
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
    const text = buildShepherdJournalInstruction(42);

    expect(text).toBe(
      "Journal substantial decisions or rejections, citing item URLs or review IDs: `pr-shepherd apply journal 42 '- <decision>'`",
    );
    expect(text).not.toContain("idempotent");
    expect(text).not.toContain(SHEPHERD_JOURNAL_SECTION);
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

    expect(text).toContain("pr-shepherd apply journal 42");
    expect(text).not.toContain("idempotent");
    // Citation conventions (cite item URLs or review IDs) stay inline: a separate playbook
    // read would cost more than the clause.
    expect(text).toContain("citing item URLs or review IDs");
    expect(text).toContain(SHEPHERD_JOURNAL_FIRST_LOOK_GUIDANCE);
    expect(countMentions(text, "Journal substantial decisions")).toBe(1);
    expect(text).not.toContain("`## Shepherd Journal` entry");
  });
  it("omits Shepherd Journal recommendations when update permission is not established", () => {
    const resolveCommand: ResolveCommand = {
      argv: ["pr-shepherd", "resolve", "42"],
      requiresHeadSha: false,
      requiresDismissMessage: false,
      hasMutations: true,
    };

    const instructions = buildFixInstructions([], [], [], [], "main", resolveCommand, false, 42, 0);

    expect(instructions.join("\n")).not.toContain("pr-shepherd apply journal");
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
    expect(text).not.toContain("pr-shepherd apply journal");
  });
});
