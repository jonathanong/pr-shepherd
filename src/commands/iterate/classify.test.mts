import { describe, expect, it } from "vitest";
import { buildResolveCommand } from "./classify.mts";
import { buildCommitSuggestionInstruction } from "../commit-suggestion-instruction.mts";
import { buildShepherdJournalInstruction } from "../shepherd-journal.mts";
import { addPrShepherdMarker } from "../../comments/marker.mts";
import { runWithDurableState } from "../../state/durable-state.mts";
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

describe("buildResolveCommand — existing-reply adoption", () => {
  const thread = botThread("bot-active");
  const build = (comments: string[] = []) =>
    buildResolveCommand(
      [thread as AgentThread],
      [],
      comments,
      [],
      [],
      FORK_PR,
      new Set(),
      [],
      undefined,
      [thread],
    );

  it("omits the opt-in flag outside durable state", () => {
    expect(build().resolveCommand.argv).not.toContain("--adopt-existing-replies");
  });

  it("adds the opt-in flag to generated reply commands in durable state", () => {
    const single = runWithDurableState(() => build());
    expect(single.resolveCommand.argv).toContain("--adopt-existing-replies");
    const split = runWithDurableState(() => build(["PRRC_one"]));
    expect(split.resolveCommand.argv).toContain("--adopt-existing-replies");
    expect(split.resolveOnlyCommand?.argv).not.toContain("--adopt-existing-replies");
  });

  it("never adds the flag to a command without replies", () => {
    const { resolveCommand } = runWithDurableState(() =>
      buildResolveCommand([], [], ["PRRC_one"], [], [], FORK_PR),
    );
    expect(resolveCommand.argv).not.toContain("--adopt-existing-replies");
  });
});
