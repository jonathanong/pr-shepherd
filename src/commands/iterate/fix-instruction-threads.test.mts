import { describe, expect, it } from "vitest";
import type { AgentThread, ResolveCommand } from "../../types.mts";
import { partitionFixThreads, reviewSectionRefs } from "./fix-instruction-threads.mts";

function command(ids: { reply?: string[]; resolve?: string[] }): ResolveCommand {
  return {
    argv: ["pr-shepherd", "apply", "review"],
    hasMutations: true,
    requiresHeadSha: false,
    requiresDismissMessage: false,
    replyThreadIds: ids.reply,
    resolveThreadIds: ids.resolve,
  };
}

function thread(overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    id: "t1",
    path: "src/foo.mts",
    line: 10,
    author: "reviewer",
    authorType: "User",
    body: "please fix",
    url: "",
    ...overrides,
  };
}

describe("partitionFixThreads", () => {
  it("keeps located threads together and splits unlocated by mutation IDs", () => {
    const located = thread({ id: "loc" });
    const mutated = thread({ id: "mut", path: null, line: null });
    const skipped = thread({ id: "skip", path: "src/foo.mts", line: null });
    const fromResolveOnly = thread({ id: "only", path: null, line: null });

    expect(
      partitionFixThreads(
        [located, mutated, skipped, fromResolveOnly],
        command({ reply: ["mut"] }),
        command({ resolve: ["only"] }),
      ),
    ).toEqual({
      locatedThreads: [located],
      unlocatedMutatedThreads: [mutated, fromResolveOnly],
      unlocatedThreads: [skipped],
    });
  });
});

describe("reviewSectionRefs", () => {
  it("omits empty sections and preserves dashboard order", () => {
    expect(
      reviewSectionRefs({
        hasReviewThreads: true,
        hasUnlocatedSkipThreads: false,
        hasActionableComments: true,
        hasFailingChecks: false,
        hasAnnotations: true,
        hasChangesRequested: false,
      }),
    ).toEqual(["`## Review threads`", "`## Actionable comments`", "`## Check annotations`"]);
  });

  it("includes the unlocated skip and CR sections when present", () => {
    expect(
      reviewSectionRefs({
        hasReviewThreads: false,
        hasUnlocatedSkipThreads: true,
        hasActionableComments: false,
        hasFailingChecks: true,
        hasAnnotations: false,
        hasChangesRequested: true,
      }),
    ).toEqual([
      "`## Unlocated review threads (logged once — no mutation)`",
      "`## Failing checks`",
      "`## Changes-requested reviews`",
    ]);
  });
});
