import { describe, it, expect } from "vitest";
import {
  registerIterateHooks,
  NOW,
  makeOpts,
  makeReport,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

// ---------------------------------------------------------------------------
// Escalate
// ---------------------------------------------------------------------------

describe("runIterate — escalate (pr-level-changes-requested with actionable comments)", () => {
  it("does NOT escalate when changesRequestedReviews + actionable comments exist (no inline threads)", async () => {
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
      expect(result.fix.resolveCommand.requiresHeadSha).toBe(false);
      expect(result.fix.resolveCommand.argv).not.toContain("--dismiss-review-ids");
      expect(result.fix.resolveCommand.argv).not.toContain("review-1");
      expect(result.fix.instructions.join("\n")).toContain("If you applied code edits: commit");
      expect(result.fix.instructions.join("\n")).toContain(
        "Run the `resolve:` command shown above",
      );
      expect(result.fix.instructions.join("\n")).toContain(
        "Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick.",
      );
    }
  });

  it("escalates when base branch is missing and review/comment path requires a push", async () => {
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
    }
  });
});
