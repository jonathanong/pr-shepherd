import { describe, expect, it } from "vitest";
import { buildResolveCommand } from "./classify.mts";
import { buildCommitSuggestionInstruction } from "../commit-suggestion-instruction.mts";
import { buildShepherdJournalInstruction } from "../shepherd-journal.mts";
import { addPrShepherdMarker } from "../../comments/marker.mts";
import type { AgentThread, ReviewThread } from "../../types.mts";

const FORK_PR = "https://github.com/fork/widgets/pull/42";

function botThread(id: string, overrides: Partial<ReviewThread> = {}): ReviewThread {
  return {
    id,
    isResolved: false,
    isOutdated: false,
    isMinimized: false,
    path: "src/a.mts",
    line: 1,
    startLine: null,
    author: "copilot-pull-request-reviewer",
    authorType: "Bot",
    body: "nit",
    url: "",
    createdAtUnix: 1,
    viewerCanReply: true,
    viewerCanResolve: true,
    ...overrides,
  };
}

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

describe("buildResolveCommand — split paired and standalone resolves", () => {
  it("puts paired bot resolves on the reply command and marker-ended bots on resolve-only", () => {
    const unmarked = botThread("bot-active");
    const marked = botThread("bot-retry", {
      comments: [
        {
          id: "c1",
          isMinimized: false,
          author: "copilot-pull-request-reviewer",
          authorType: "Bot",
          body: "nit",
          url: "",
          createdAtUnix: 1,
        },
        {
          id: "c2",
          isMinimized: false,
          author: "shepherd",
          authorType: "User",
          body: addPrShepherdMarker("retry"),
          url: "",
          createdAtUnix: 2,
        },
      ],
    });
    const { resolveCommand, resolveOnlyCommand } = buildResolveCommand(
      [unmarked as AgentThread],
      [marked],
      [],
      [],
      [],
      FORK_PR,
      new Set(),
      [],
      undefined,
      [unmarked, marked],
    );

    expect(resolveCommand.argv).toContain("--resolve-thread-ids");
    expect(resolveCommand.argv).toContain("bot-active");
    expect(resolveOnlyCommand?.argv).toContain("--resolve-thread-ids");
    expect(resolveOnlyCommand?.argv).toContain("bot-retry");
  });
});
