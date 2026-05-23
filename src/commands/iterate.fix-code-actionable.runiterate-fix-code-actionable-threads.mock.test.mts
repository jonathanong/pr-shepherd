import { describe, it, expect, vi } from "vitest";
import {
  registerIterateHooks,
  NOW,
  makeOpts,
  makeReport,
  makeReview,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "./iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

describe("runIterate — fix_code (actionable threads)", () => {
  it("routes human resolution-only threads to reply without requiring a push SHA", async () => {
    const outdated = {
      id: "thread-outdated",
      isResolved: false,
      isOutdated: true,
      isMinimized: false,
      path: "src/old.mts",
      line: null,
      startLine: null,
      author: "reviewer",
      authorType: "User" as const,
      body: "old location",
      url: "",
      createdAtUnix: NOW - 3600,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: {
          actionable: [],
          resolutionOnly: [outdated],
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
      expect(result.fix.threads).toHaveLength(0);
      expect(result.fix.resolutionOnlyThreads.map((t) => t.id)).toEqual(["thread-outdated"]);
      expect(result.fix.resolveCommand.argv).toContain("--reply-thread-ids");
      expect(result.fix.resolveCommand.argv).toContain("thread-outdated");
      expect(result.fix.resolveCommand.requiresHeadSha).toBe(false);
      expect(result.fix.resolveCommand.requiresDismissMessage).toBe(true);
      expect(result.fix.instructions.join("\n")).not.toContain("Rebase and push");
    }
  });
  it("returns action: fix_code with 2 actionable threads and 0 CI failures", async () => {
    const thread1 = {
      id: "thread-1",
      isResolved: false,
      isOutdated: false,
      isMinimized: false,
      path: "src/foo.mts",
      line: 10,
      startLine: null,
      author: "reviewer",
      authorType: "Unknown" as const,
      body: "Fix this bug",
      url: "",
      createdAtUnix: NOW - 3600,
    };
    const thread2 = {
      id: "thread-2",
      isResolved: false,
      isOutdated: false,
      isMinimized: false,
      path: "src/bar.mts",
      line: 20,
      startLine: null,
      author: "reviewer",
      authorType: "Unknown" as const,
      body: "Fix this too",
      url: "",
      createdAtUnix: NOW - 3600,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: {
          actionable: [thread1, thread2],
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
      expect(result.fix.threads).toHaveLength(2);
      expect(result.fix.actionableComments).toHaveLength(0);
      expect(result.fix.checks).toHaveLength(0);
      expect(result.cancelled).toHaveLength(0);
      const joined = result.fix.instructions.join("\n");
      // push with no cancelled → stop-iteration but no no-recancel warning
      expect(joined).toContain("Stop this iteration");
      expect(joined).not.toContain("Do not re-run");
    }
  });

  it("does not warn about review/minimize overlap when review dismissals are not generated", async () => {
    const writeSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    try {
      const thread = {
        id: "thread-overlap",
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
      const review = makeReview("PRR_SHARED", "copilot", "Please update this section.");
      const reviewAsRequest = {
        id: "PRR_SHARED",
        author: review.author,
        authorType: review.authorType,
        body: review.body,
      };
      mockRunCheck.mockResolvedValue(
        makeReport({
          status: "UNRESOLVED_COMMENTS",
          threads: {
            actionable: [thread],
            resolutionOnly: [],
            autoResolved: [],
            autoResolveErrors: [],
            firstLook: [],
          },
          reviewSummaries: [review],
          changesRequestedReviews: [reviewAsRequest],
        }),
      );
      mockUpdateReadyDelay.mockResolvedValue({
        isReady: false,
        shouldCancel: false,
        remainingSeconds: 600,
      });

      const result = await runIterate(makeOpts());

      expect(result.action).toBe("fix_code");
      const messages = writeSpy.mock.calls.map(([chunk]) => String(chunk ?? ""));
      expect(
        messages.some((message) =>
          message.includes("pr-shepherd: resolve command overlap: 1 review IDs"),
        ),
      ).toBe(false);
    } finally {
      writeSpy.mockRestore();
    }
  });
});
