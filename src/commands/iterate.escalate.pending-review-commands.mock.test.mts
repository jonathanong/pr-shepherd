import { describe, expect, it } from "vitest";
import { registerIterateHooks } from "../../test-helpers/commands/iterate-test-support.mts";
import { buildEscalateHumanMessage } from "./iterate/escalate.mts";

registerIterateHooks();

describe("escalate pending review commands", () => {
  it("renders pending review commands in a dedicated section", () => {
    const message = buildEscalateHumanMessage(
      {
        triggers: ["fix-thrash"],
        unresolvedThreads: [],
        ambiguousComments: [],
        changesRequestedReviews: [],
        firstLookSummaries: [
          {
            id: "review-1",
            author: "review-bot",
            authorType: "Bot",
            body: "Summary body that must be read before minimization.",
          },
        ],
        pendingReviewCommands: {
          resolveOnlyCommand: {
            argv: ["pr-shepherd", "apply", "review", "42", "--resolve-thread-ids", "t-1"],
            requiresHeadSha: false,
            requiresDismissMessage: false,
            hasMutations: true,
          },
        },
        suggestion: "manual",
      },
      42,
    );

    expect(message).toContain("## Pending review commands");
    expect(message).toContain("resolve-only:");
    expect(message).toContain("t-1");
    expect(message).toContain("### Review summaries (first look)");
    expect(message).toContain("Summary body that must be read before minimization.");
  });
});
