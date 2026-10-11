import { describe, it, expect } from "vitest";
import { registerIterateHooks } from "../../test-helpers/commands/iterate-test-support.mts";
import { buildEscalateHumanMessage } from "./iterate/escalate.mts";

registerIterateHooks();

describe("escalate thread transcripts", () => {
  it("renders every comment of a thread transcript with its comment ID", () => {
    const message = buildEscalateHumanMessage(
      {
        triggers: ["fix-thrash"],
        unresolvedThreads: [
          {
            id: "PRRT_1",
            path: "src/a.ts",
            line: 3,
            author: "alice",
            body: "Root body",
            url: "",
            comments: [
              { id: "PRRC_1", author: "alice", body: "Root body", url: "" },
              { id: "PRRC_2", author: "bob", body: "Reply\nsecond line", url: "" },
            ],
          },
        ],
        ambiguousComments: [],
        changesRequestedReviews: [],
        suggestion: "manual",
      },
      42,
    );

    expect(message).toContain(
      [
        "- thread `PRRT_1` — `src/a.ts:3` (@alice):",
        "",
        "  - comment `PRRC_1` (@alice):",
        "",
        "    > Root body",
        "",
        "  - comment `PRRC_2` (@bob):",
        "",
        "    > Reply",
        "    > second line",
      ].join("\n"),
    );
  });
});
