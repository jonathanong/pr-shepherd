import { describe, expect, it } from "vitest";
import { buildResolveCommand } from "./classify.mts";
import { buildCommitSuggestionInstruction } from "../commit-suggestion-instruction.mts";
import { buildShepherdJournalInstruction } from "../shepherd-journal.mts";

const FORK_PR = "https://github.com/fork/widgets/pull/42";

describe("iterate follow-up references", () => {
  it("uses a canonical full URL for review mutations", () => {
    const { resolveCommand } = buildResolveCommand([], [], ["PRRC_one"], [], [], FORK_PR);

    expect(resolveCommand.argv).toEqual([
      "pr-shepherd",
      "apply",
      "review",
      FORK_PR,
      "--minimize-comment-ids",
      "PRRC_one",
    ]);
  });

  it("uses the full PR URL for suggestion and journal follow-up instructions", () => {
    expect(buildCommitSuggestionInstruction(FORK_PR, "## Review threads")).toContain(
      `pr-shepherd build-suggestion-patches ${FORK_PR}`,
    );
    expect(buildShepherdJournalInstruction(FORK_PR)).toContain(
      `pr-shepherd apply journal ${FORK_PR}`,
    );
  });
});
