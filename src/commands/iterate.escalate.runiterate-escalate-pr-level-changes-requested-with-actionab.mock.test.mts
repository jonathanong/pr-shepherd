// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerIterateHooks,
  NOW,
  makeOpts,
  makeReport,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "./iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

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

describe("runIterate — escalate (pr-level-changes-requested with actionable comments)", () => {
  it("does NOT escalate when changesRequestedReviews + actionable comments exist (second case)", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        changesRequestedReviews: [
          { id: "review-1", author: "boss", authorType: "Unknown" as const, body: "Needs rework" },
        ],
        threads: {
          actionable: [],
          resolutionOnly: [],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [],
        },
        comments: {
          actionable: [
            {
              id: "comment-1",
              isMinimized: false,
              author: "boss",
              authorType: "Unknown" as const,
              body: "See review",
              url: "",
              createdAtUnix: NOW - 100,
            },
          ],
          firstLook: [],
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action === "fix_code") {
      expect(result.fix.resolveCommand.requiresHeadSha).toBe(true);
      expect(result.fix.resolveCommand.argv).toContain("--dismiss-review-ids");
      expect(result.fix.resolveCommand.argv).toContain("review-1");
      expect(result.fix.instructions.join("\n")).toContain("Rebase and push:");
      expect(result.fix.instructions.join("\n")).toContain(
        "Stop this iteration — CI needs time to run on the new push",
      );
    }
  });

  it("escalates when changesRequestedReviews + actionable comments exist with missing base branch", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        baseBranch: "",
        changesRequestedReviews: [
          { id: "review-2", author: "boss", authorType: "Unknown" as const, body: "Needs rework" },
        ],
        threads: {
          actionable: [],
          resolutionOnly: [],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [],
        },
        comments: {
          actionable: [
            {
              id: "comment-2",
              isMinimized: false,
              author: "boss",
              authorType: "Unknown" as const,
              body: "Also related review comment",
              url: "",
              createdAtUnix: NOW - 100,
            },
          ],
          firstLook: [],
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("escalate");
    if (result.action === "escalate") {
      expect(result.escalate.triggers).toContain("base-branch-unknown");
      expect(result.escalate.changesRequestedReviews).toHaveLength(1);
      expect(result.escalate.changesRequestedReviews[0]?.id).toBe("review-2");
    }
  });
});
