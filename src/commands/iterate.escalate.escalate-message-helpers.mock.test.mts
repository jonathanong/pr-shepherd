import { describe, it, expect } from "vitest";
import {
  registerIterateHooks,
  defaultConfig,
  mockLoadConfig,
} from "../../test-helpers/commands/iterate-test-support.mts";
import {
  buildEscalateHumanMessage,
  buildEscalateSuggestion,
  checkEscalateTriggers,
  formatDurationApprox,
} from "./iterate/escalate.mts";

registerIterateHooks();

// ---------------------------------------------------------------------------
// Escalate
// ---------------------------------------------------------------------------

describe("escalate message helpers", () => {
  it("includes ambiguous comments and fallback suggestions", () => {
    const message = buildEscalateHumanMessage(
      {
        triggers: ["thread-missing-location"],
        unresolvedThreads: [],
        ambiguousComments: [
          {
            id: "c-ambiguous",
            author: "reviewer",
            authorType: "User",
            body: "Please consider the whole design\nmore detail",
            url: "",
          },
        ],
        changesRequestedReviews: [],
        suggestion: "manual",
      },
      42,
    );

    expect(message).toContain("comment `c-ambiguous`");
    expect(message).toContain("Please consider the whole design");
    expect(buildEscalateSuggestion([])).toBe(
      "Ambiguous state — automated handling cannot proceed safely. Inspect the PR and act manually.",
    );
  });

  it("renders thread/review item fallbacks, thrash attempts, and singular stall wording", () => {
    const message = buildEscalateHumanMessage(
      {
        triggers: ["fix-thrash"],
        unresolvedThreads: [
          {
            id: "t-no-loc",
            path: null,
            line: null,
            startLine: undefined,
            author: "reviewer",
            authorType: "User",
            body: "Thread body\nmore detail",
            url: "",
          },
        ],
        ambiguousComments: [],
        changesRequestedReviews: [
          { id: "r1", author: "reviewer", authorType: "User", body: "Review body\nmore detail" },
        ],
        thrashHistory: [{ threadId: "t-no-loc", attempts: 3 }],
        suggestion: "manual",
      },
      42,
    );

    expect(message).toContain("(no location)");
    expect(message).toContain("review `r1`");
    expect(message).toContain("attempted 3 times");
    expect(buildEscalateSuggestion(["stall-timeout"], "1 minute")).toContain("1 minute —");
    expect(buildEscalateSuggestion(["stall-timeout"])).toContain("60 minutes —");
    expect(buildEscalateSuggestion(["base-branch-unknown"])).toContain("base branch");
  });

  it("formats sub-minute durations as seconds and everything else as whole minutes", () => {
    expect(formatDurationApprox(0)).toBe("0 seconds");
    expect(formatDurationApprox(1)).toBe("1 second");
    expect(formatDurationApprox(8)).toBe("8 seconds");
    expect(formatDurationApprox(59)).toBe("59 seconds");
    expect(formatDurationApprox(60)).toBe("1 minute");
    expect(formatDurationApprox(125)).toBe("2 minutes");
    expect(formatDurationApprox(3600)).toBe("60 minutes");
    expect(formatDurationApprox(9960)).toBe("166 minutes");
  });

  it("uses zero attempts for missing thread attempt records", () => {
    mockLoadConfig.mockReturnValue(defaultConfig());
    const { triggers, thrashHistory } = checkEscalateTriggers(
      [
        {
          id: "t1",
          isResolved: false,
          isOutdated: false,
          isMinimized: false,
          path: "src/a.ts",
          line: 1,
          startLine: null,
          author: "reviewer",
          authorType: "User",
          body: "body",
          url: "",
          createdAtUnix: 0,
        },
      ],
      {},
    );

    expect(triggers).toEqual([]);
    expect(thrashHistory).toBeUndefined();
  });
});
