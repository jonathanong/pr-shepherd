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
            authorAssociation: "MEMBER",
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
    expect(message).toContain("@reviewer · User · MEMBER");
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

  it("renders complete failing-check evidence for a check escalation", () => {
    const message = buildEscalateHumanMessage(
      {
        triggers: ["check-follow-up-unavailable"],
        unresolvedThreads: [],
        ambiguousComments: [],
        changesRequestedReviews: [],
        checks: [
          {
            name: "tests",
            runId: "123",
            detailsUrl: "https://github.com/owner/repo/actions/runs/123",
            conclusion: "ACTION_REQUIRED",
            workflowName: "CI",
            jobName: "tests (linux)",
            failedStep: "Approve deployment",
            summary: "Waiting for approval",
            logExcerpt: "manual approval required",
            scope: "merge_group",
            annotations: [
              {
                id: "annotation-1",
                path: "src/a.ts",
                startLine: 4,
                endLine: 5,
                level: "failure",
                title: "Blocked",
                message: "approval is required",
                rawDetails: "environment: production",
                blobUrl: "https://github.com/owner/repo/blob/abc/src/a.ts#L4-L5",
              },
            ],
          },
        ],
        suggestion: buildEscalateSuggestion(["check-follow-up-unavailable"]),
      },
      42,
    );

    expect(message).toContain("check-follow-up-unavailable");
    expect(message).toContain("run `123`");
    expect(message).toContain("URL `https://github.com/owner/repo/actions/runs/123`");
    expect(message).toContain("CI › tests (linux)");
    expect(message).toContain("ACTION_REQUIRED");
    expect(message).toContain("Approve deployment");
    expect(message).toContain("manual approval required");
    expect(message).toContain("scope `merge_group`");
    expect(message).toContain("annotation-1");
    expect(message).toContain("src/a.ts:4-5");
    expect(message).toContain("environment: production");
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
