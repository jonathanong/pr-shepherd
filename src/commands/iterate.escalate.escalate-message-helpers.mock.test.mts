// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerIterateHooks,
  NOW,
  defaultConfig,
  mockLoadConfig,
} from "./iterate-test-support.mts";
import {
  buildEscalateHumanMessage,
  buildEscalateSuggestion,
  checkEscalateTriggers,
} from "./iterate/escalate.mts";

registerIterateHooks();

// ---------------------------------------------------------------------------
// Escalate
// ---------------------------------------------------------------------------

const THREAD = {
  id: "thread-1",
  isResolved: false,
  isOutdated: false,
  isMinimized: false,
  path: "src/foo.mts",
  line: 10,
  startLine: null,
  author: "reviewer",
  authorType: "Unknown" as const,
  body: "Fix this",
  url: "",
  createdAtUnix: NOW - 3600,
};

const RESOLUTION_ONLY_THREAD = {
  ...THREAD,
  id: "thread-resolution-only",
  isOutdated: true,
  line: null,
  body: "Already addressed on an old diff",
};

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
    expect(buildEscalateSuggestion(["stall-timeout"], "1")).toContain("1 minute —");
    expect(buildEscalateSuggestion(["base-branch-unknown"])).toContain("base branch");
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
      [],
      [],
      [],
      [],
      {},
      false,
    );

    expect(triggers).toEqual([]);
    expect(thrashHistory).toBeUndefined();
  });
});
