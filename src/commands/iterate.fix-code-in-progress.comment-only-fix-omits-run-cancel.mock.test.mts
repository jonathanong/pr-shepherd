import { describe, it, expect } from "vitest";
import {
  registerHooks,
  makeOpts,
  makeReport,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "../../test-helpers/commands/iterate.fix-code-in-progress.test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerHooks();

describe("fix_code — in-progress run cancellation", () => {
  it("inProgressRunIds is included for actionable-comment fixes so agent can decide whether to cancel", async () => {
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
      // actionable comments may require code edits, so in-progress runs are surfaced
      expect(result.fix.inProgressRunIds).toContain("run-in-comment-only");
      // Instruction is conditional ("If you decide to push") rather than mandatory
      expect(result.fix.instructions.join("\n")).toMatch(/If you decide to push new commits/);
      // No prescriptive rebase commands
      expect(result.fix.instructions.join("\n")).not.toMatch(/git fetch origin && git rebase/);
    }
  });

  it("cancels in-progress runs for review-only + comments paths that require a push", async () => {
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
      expect(result.fix.inProgressRunIds).toContain("run-in-review-only");
      // Non-human CR review is auto-dismissed (in resolveCommand); SHA-gated as a post-push mutation.
      // Minimize of the actionable comment splits to resolveOnlyCommand.
      expect(result.fix.resolveCommand.requiresHeadSha).toBe(true);
      expect(result.fix.resolveCommand.argv).toContain("--dismiss-review-ids");
      expect(result.fix.resolveCommand.argv).toContain("PRR_review_change_request");
      expect(result.fix.resolveOnlyCommand?.argv).toContain("--minimize-comment-ids");
      expect(result.fix.resolveOnlyCommand?.argv).toContain("IC_comment_only_with_review");
      const instructions = result.fix.instructions.join("\n");
      expect(instructions).toMatch(/If you decide to push new commits/);
      // Commit/push guidance lives in the leading decision line; CLI no longer prescribes rebase
      expect(instructions).toContain(
        "**If any code changes are needed:** apply edits, commit, push",
      );
      expect(instructions).not.toMatch(/rebase onto/);
      expect(instructions).toContain(
        "Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick.",
      );
    }
  });
});
