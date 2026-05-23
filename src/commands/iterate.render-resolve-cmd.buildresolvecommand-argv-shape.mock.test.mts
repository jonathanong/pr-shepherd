/* eslint-disable max-lines */
import { describe, it, expect } from "vitest";
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
              authorType: "User" as const,
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

  it("dedupes thread IDs and does not generate review dismissals for overlap cases", async () => {
    const thread = {
      id: "thread-1",
      isResolved: false,
      isOutdated: false,
      isMinimized: false,
      path: "src/foo.mts",
      line: 10,
      startLine: null,
      author: "reviewer",
      authorType: "User" as const,
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
      authorType: "User" as const,
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
            author: "bot-reviewer[bot]",
            authorType: "Bot" as const,
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

    const replyThreadArg =
      result.fix.resolveCommand.argv[
        result.fix.resolveCommand.argv.indexOf("--reply-thread-ids") + 1
      ];
    expect(replyThreadArg).toBe("thread-1,res-thread-1");
    expect(result.fix.resolveCommand.argv).toContain("--minimize-comment-ids");
    expect(result.fix.resolveCommand.argv).toContain("PRR_DUP");
    expect(result.fix.resolveCommand.argv).not.toContain("--dismiss-review-ids");
    expect(result.fix.resolveCommand.requiresDismissMessage).toBe(true);
  });

  it("routes pr-level review requests to fix_code without generated dismissals", async () => {
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
      expect(result.fix.resolveCommand.argv).not.toContain("--dismiss-review-ids");
      expect(result.fix.resolveCommand.argv).not.toContain("PRR_CHANGES");
      expect(result.fix.resolveCommand.requiresDismissMessage).toBe(false);
      expect(result.fix.changesRequestedReviews).toHaveLength(1);
    }
  });

  it("does not generate dismiss-review mutations for human reviews", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        changesRequestedReviews: [
          {
            id: "PRR_HUMAN",
            author: "reviewer",
            authorType: "User" as const,
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
    if (result.action !== "fix_code") return;

    expect(result.fix.resolveCommand.argv).not.toContain("--dismiss-review-ids");
    expect(result.fix.resolveCommand.argv).not.toContain("PRR_HUMAN");
    expect(result.fix.changesRequestedReviews).toHaveLength(1);
  });

  it("resolves bot threads while replying to human threads", async () => {
    const humanThread = {
      id: "thread-human",
      isResolved: false,
      isOutdated: false,
      isMinimized: false,
      path: "src/human.mts",
      line: 10,
      startLine: null,
      author: "reviewer",
      authorType: "User" as const,
      body: "fix this",
      url: "",
      createdAtUnix: NOW - 3600,
    };
    const botThread = {
      ...humanThread,
      id: "thread-bot",
      path: "src/bot.mts",
      author: "copilot-pull-request-reviewer",
      authorType: "Bot" as const,
    };
    const bracketBotThread = {
      ...humanThread,
      id: "thread-bracket-bot",
      path: "src/bracket-bot.mts",
      author: "github-actions[bot]",
      authorType: "User" as const,
    };
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: {
          actionable: [humanThread, botThread, bracketBotThread],
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
    if (result.action !== "fix_code") return;

    const argv = result.fix.resolveCommand.argv;
    expect(argv).toContain("--reply-thread-ids");
    expect(argv).toContain("thread-human");
    expect(argv).toContain("--resolve-thread-ids");
    expect(argv).toContain("thread-bot,thread-bracket-bot");
    expect(result.fix.resolveCommand.requiresDismissMessage).toBe(true);
    expect(result.fix.resolveCommand.hasMutations).toBe(true);
  });
});
