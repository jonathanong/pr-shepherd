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
          {
            id: "review-1",
            author: "boss",
            authorType: "Unknown" as const,
            body: "Needs rework",
          },
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

    const result = await runIterate({ ...makeOpts(), instructions: "inline" });

    expect(result.action).toBe("triage");
    if (result.action === "triage") {
      // Actionable PR-comment minimize rides in resolveCommand; non-human CR review
      // dismissal and hiding run in the separate SHA-gated dismissReviewsCommand.
      expect(result.triage.resolveCommand.requiresHeadSha).toBe(false);
      expect(result.triage.resolveCommand.argv).toContain("--minimize-comment-ids");
      expect(result.triage.resolveCommand.argv).toContain("comment-1");
      expect(result.triage.resolveOnlyCommand).toBeUndefined();
      expect(result.triage.dismissReviewsCommand?.requiresHeadSha).toBe(true);
      expect(result.triage.dismissReviewsCommand?.argv).toContain("--dismiss-review-ids");
      expect(result.triage.dismissReviewsCommand?.argv).toContain("--minimize-comment-ids");
      expect(result.triage.dismissReviewsCommand?.argv).toContain("review-1");
      expect(result.triage.instructions.join("\n")).toContain(
        "Commit and push any changes to the PR head.",
      );
      expect(result.triage.instructions.join("\n")).toContain(
        "Run, even if no code changed: `pr-shepherd apply review https://github.com/owner/repo/pull/42 --minimize-comment-ids comment-1`",
      );
      expect(result.triage.instructions.join("\n")).toContain(
        "`$CHANGE_MESSAGE`: one sentence on what changed. Run even if no code changed to dismiss and hide resolved reviews: `pr-shepherd apply review",
      );
      expect(result.triage.instructions.join("\n")).toContain("Rerun Shepherd now.");
    }
  });
});
