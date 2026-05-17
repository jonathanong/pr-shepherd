// @ts-nocheck
/* eslint-disable max-lines */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderResolveCommand } from "./iterate/render.mts";
import {
  registerIterateHooks,
  NOW,
  defaultConfig,
  makeOpts,
  makeReport,
  makeReview,
  mockLoadConfig,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "./iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

describe("buildResolveCommand (via runIterate) — argv shape invariants", () => {
  it("never puts $HEAD_SHA or --require-sha into argv (they're appended by renderResolveCommand)", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: {
          actionable: [
            {
              id: "t-1",
              isResolved: false,
              isOutdated: false,
              isMinimized: false,
              path: "src/foo.mts",
              line: 10,
              startLine: null,
              author: "reviewer",
              authorType: "Unknown" as const,
              body: "fix me",
              url: "",
              createdAtUnix: NOW - 3600,
            },
          ],
          resolutionOnly: [],
          autoResolved: [],
          autoResolveErrors: [],
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
      expect(result.fix.resolveCommand.argv).not.toContain("$HEAD_SHA");
      expect(result.fix.resolveCommand.argv).not.toContain("--require-sha");
      expect(result.fix.resolveCommand.requiresHeadSha).toBe(true);
    }
  });

  it("dedupes thread IDs and records dropped dismiss IDs when reviews overlap minimize targets", async () => {
    const thread = {
      id: "thread-1",
      isResolved: false,
      isOutdated: false,
      isMinimized: false,
      path: "src/foo.mts",
      line: 10,
      startLine: null,
      author: "reviewer",
      authorType: "Unknown" as const,
      body: "fix this",
      url: "",
      createdAtUnix: NOW - 3600,
    };
    const resolutionOnly = {
      id: "res-thread-1",
      isResolved: false,
      isOutdated: true,
      isMinimized: false,
      path: "src/old.mts",
      line: null,
      startLine: null,
      author: "reviewer",
      authorType: "Unknown" as const,
      body: "old thread",
      url: "",
      createdAtUnix: NOW - 7200,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: {
          actionable: [thread, thread],
          resolutionOnly: [resolutionOnly, resolutionOnly],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [],
        },
        reviewSummaries: [makeReview("PRR_DUP", "copilot", "bot summary")],
        changesRequestedReviews: [
          {
            id: "PRR_DUP",
            author: "reviewer",
            authorType: "Unknown" as const,
            body: "Please address",
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
    if (result.action !== "fix_code") return;

    const resolveThreadArg =
      result.fix.resolveCommand.argv[
        result.fix.resolveCommand.argv.indexOf("--resolve-thread-ids") + 1
      ];
    expect(resolveThreadArg).toBe("thread-1,res-thread-1");
    expect(result.fix.resolveCommand.argv).toContain("--minimize-comment-ids");
    expect(result.fix.resolveCommand.argv).toContain("PRR_DUP");
    expect(result.fix.resolveCommand.argv).not.toContain("--dismiss-review-ids");
    expect(result.fix.resolveCommand.requiresDismissMessage).toBe(false);
    expect(result.fix.resolveCommand.droppedDismissReviewIds).toEqual(["PRR_DUP"]);
  });

  it("routes pr-level review requests to fix_code (with --dismiss-review-ids) when no inline work exists", async () => {
    // A CHANGES_REQUESTED review has its own distinct ID — it is not also in reviewSummaries.
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        changesRequestedReviews: [
          {
            id: "PRR_CHANGES",
            author: "reviewer",
            authorType: "Unknown" as const,
            body: "Please update the API contract wording.",
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
      expect(result.fix.resolveCommand.argv).toContain("--dismiss-review-ids");
      expect(result.fix.resolveCommand.argv).toContain("PRR_CHANGES");
      expect(result.fix.resolveCommand.requiresDismissMessage).toBe(true);
      expect(result.fix.changesRequestedReviews).toHaveLength(1);
    }
  });
});
