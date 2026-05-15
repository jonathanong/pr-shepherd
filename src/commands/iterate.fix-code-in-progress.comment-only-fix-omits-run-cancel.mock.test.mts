// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerHooks,
  makeOpts,
  makeReport,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "./iterate.fix-code-in-progress.test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerHooks();

describe("fix_code — in-progress run cancellation", () => {
  it("inProgressRunIds is empty for comment-only fixes because no push is guaranteed", async () => {
    const inProgressCheck = {
      name: "ci",
      status: "IN_PROGRESS" as const,
      conclusion: null,
      detailsUrl: "https://github.com/owner/repo/actions/runs/run-in-comment-only",
      event: "pull_request" as const,
      runId: "run-in-comment-only",
      category: "in_progress" as const,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        checks: {
          passing: [],
          failing: [],
          inProgress: [inProgressCheck],
          skipped: [],
          filtered: [],
          filteredNames: [],
          blockedByFilteredCheck: false,
        },
        comments: {
          actionable: [
            {
              id: "IC_comment_only",
              isMinimized: false,
              author: "reviewer",
              authorType: "Unknown" as const,
              body: "Please consider this note.",
              url: "https://github.com/owner/repo/pull/42#issuecomment-1",
              createdAtUnix: 0,
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
      expect(result.fix.actionableComments).toHaveLength(1);
      expect(result.fix.inProgressRunIds).toHaveLength(0);
      expect(result.fix.instructions.join("\n")).not.toMatch(/Cancel in-progress CI runs first/);
      expect(result.fix.instructions.join("\n")).not.toMatch(/Rebase and push/);
    }
  });

  it("does not cancel in-progress runs for review-only + comments paths", async () => {
    const inProgressCheck = {
      name: "ci",
      status: "IN_PROGRESS" as const,
      conclusion: null,
      detailsUrl: "https://github.com/owner/repo/actions/runs/run-in-review-only",
      event: "pull_request" as const,
      runId: "run-in-review-only",
      category: "in_progress" as const,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        checks: {
          passing: [],
          failing: [],
          inProgress: [inProgressCheck],
          skipped: [],
          filtered: [],
          filteredNames: [],
          blockedByFilteredCheck: false,
        },
        comments: {
          actionable: [
            {
              id: "IC_comment_only_with_review",
              isMinimized: false,
              author: "reviewer",
              authorType: "Unknown" as const,
              body: "Please rename this for clarity.",
              url: "https://github.com/owner/repo/pull/42#issuecomment-2",
              createdAtUnix: 0,
            },
          ],
          firstLook: [],
        },
        changesRequestedReviews: [
          {
            id: "PRR_review_change_request",
            author: "reviewer",
            authorType: "Unknown" as const,
            body: "Can you tweak the PR body and update the title wording?",
          },
        ],
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
      expect(result.fix.actionableComments).toHaveLength(1);
      expect(result.fix.changesRequestedReviews).toHaveLength(1);
      expect(result.fix.inProgressRunIds).toHaveLength(0);
      expect(result.fix.resolveCommand.requiresHeadSha).toBe(true);
      expect(result.fix.resolveCommand.argv).toContain("--dismiss-review-ids");
      expect(result.fix.resolveCommand.argv).toContain("PRR_review_change_request");
      const instructions = result.fix.instructions.join("\n");
      expect(instructions).not.toMatch(/Cancel in-progress CI runs first/);
      expect(instructions).toContain(
        "Rebase and push: `git fetch origin && git rebase origin/main && git push --force-with-lease`",
      );
      expect(instructions).toContain(
        "Stop this iteration — CI needs time to run on the new push before the next tick.",
      );
    }
  });
});
