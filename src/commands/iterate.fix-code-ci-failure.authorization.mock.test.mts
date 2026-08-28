import { describe, expect, it } from "vitest";
import {
  makeOpts,
  makeReport,
  mockFetch,
  mockRunCheck,
  mockUpdateReadyDelay,
  registerIterateHooks,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";
import { makeThread } from "../../test-helpers/commands/iterate-thread-test-support.mts";

registerIterateHooks();

describe("fix_code — GitHub Actions authorization", () => {
  it("does not cancel or recommend cancelling workflow runs without an exact capability", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "FAILING",
        checks: {
          passing: [],
          failing: [
            {
              name: "tests",
              status: "COMPLETED",
              conclusion: "FAILURE",
              detailsUrl: "https://github.com/owner/repo/actions/runs/123",
              event: "pull_request",
              runId: "123",
              category: "failing",
            },
          ],
          inProgress: [
            {
              name: "lint",
              status: "IN_PROGRESS",
              conclusion: null,
              detailsUrl: "https://github.com/owner/repo/actions/runs/456",
              event: "pull_request",
              runId: "456",
              category: "in_progress",
            },
          ],
          skipped: [],
          filtered: [],
          filteredNames: [],
          blockedByFilteredCheck: false,
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
    if (result.action !== "fix_code") return;
    expect(result.cancelled).toEqual([]);
    expect(result.fix.inProgressRunIds).toEqual([]);
    expect(result.fix.instructions.join("\n")).not.toContain("gh run cancel");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("escalates a denied suppressed auto-resolve thread without recommending a mutation", async () => {
    const thread = makeThread({
      id: "thread-denied",
      author: "review-bot",
      authorType: "Bot",
      viewerCanReply: false,
      viewerCanResolve: false,
    });
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: {
          actionable: [thread],
          resolutionOnly: [],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [],
          ruleAutoResolveIds: [thread.id],
        },
      }),
    );

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("escalate");
    if (result.action !== "escalate") return;
    expect(result.escalate.triggers).toContain("authorization-required");
    expect(result.escalate.authorization).toEqual([
      {
        action: "resolve-thread",
        targetIds: [thread.id],
        reason: "denied-or-unverifiable",
      },
    ]);
    expect(result.escalate.humanMessage).not.toContain("pr-shepherd apply review");
  });

  it("reports denied reply and dismissal authorization", async () => {
    const thread = makeThread({
      id: "thread-human",
      author: "alice",
      authorType: "User",
      viewerCanReply: false,
      viewerCanResolve: false,
    });
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        viewerAuthorization: {
          repositoryPermission: "WRITE",
          viewerCanAdminister: false,
          viewerDidAuthor: true,
          viewerCanUpdate: true,
          viewerCanEnableAutoMerge: true,
          viewerCanEditFiles: true,
          headRepositoryPermission: "WRITE",
        },
        threads: {
          actionable: [thread],
          resolutionOnly: [],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [],
        },
        changesRequestedReviews: [
          { id: "review-bot", author: "review-bot", authorType: "Bot", body: "fix" },
        ],
      }),
    );

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("escalate");
    if (result.action !== "escalate") return;
    expect(result.escalate.authorization?.map((item) => item.action)).toEqual([
      "reply-thread",
      "dismiss-review",
    ]);
  });
});
