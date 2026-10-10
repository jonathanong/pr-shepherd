import { describe, expect, it } from "vitest";
import type { AgentThread, ResolveCommand } from "../../types.mts";
import { partitionFixThreads } from "./fix-instruction-threads.mts";

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
