import { describe, it, expect } from "vitest";
import {
  registerIterateHooks,
  defaultConfig,
  makeOpts,
  makeReport,
  makeReview,
  mockAutoMinimizeComments,
  mockLoadConfig,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

// ---------------------------------------------------------------------------
// Review summary minimize — issue #70, issue #313
// (first-look-specific cases live in
//  iterate.classify.runiterate-review-summary-first-look-minimize.mock.test.mts)
// ---------------------------------------------------------------------------

describe("runIterate — review summary auto-minimize", () => {
  const botSummary = makeReview("PRR_BOT", "copilot-pull-request-reviewer", "overview");
  const genericBotSummary = makeReview("PRR_GEM", "gemini-code-assist", "overview");
  const bracketBotSummary = makeReview("PRR_BRK", "github-actions[bot]", "overview");
  const humanSummary = {
    ...makeReview("PRR_HUMAN", "alice", "nice work"),
    authorType: "User" as const,
  };

  it("self-minimizes an already-seen bot summary in-process and does not route to fix_code", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ reviewSummaries: [botSummary] }));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(mockAutoMinimizeComments).toHaveBeenCalledWith(["PRR_BOT"]);
    expect(result.action).toBe("wait");
  });
  it("does not minimize a bot summary while a child thread is unresolved", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        reviewSummaries: [botSummary],
        threads: {
          actionable: [],
          resolutionOnly: [
            {
              id: "thread-child",
              reviewId: "PRR_BOT",
              isResolved: false,
              isOutdated: true,
              isMinimized: false,
              path: "src/foo.mts",
              line: 10,
              startLine: null,
              author: "copilot-pull-request-reviewer",
              authorType: "Bot" as const,
              body: "outdated child",
              url: "",
              createdAtUnix: 0,
            },
          ],
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

    expect(mockAutoMinimizeComments).not.toHaveBeenCalled();
    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") return;
    expect(result.fix.reviewSummaryIds).toEqual([]);
    expect(result.fix.resolveCommand.argv).not.toContain("PRR_BOT");
    expect(result.fix.resolveCommand.resolveThreadIds).toEqual(["thread-child"]);
  });
  it("classifies the `*[bot]` login suffix as a bot", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ reviewSummaries: [bracketBotSummary] }));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });
    const result = await runIterate(makeOpts());

    expect(mockAutoMinimizeComments).toHaveBeenCalledWith(["PRR_BRK"]);
    expect(result.action).toBe("wait");
  });
  it("classifies known bot logins (gemini-code-assist) as bots", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ reviewSummaries: [genericBotSummary] }));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });
    const result = await runIterate(makeOpts());

    expect(mockAutoMinimizeComments).toHaveBeenCalledWith(["PRR_GEM"]);
    expect(result.action).toBe("wait");
  });
  it("does not minimize GitHub-classified human summaries", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ reviewSummaries: [humanSummary] }));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });
    const result = await runIterate(makeOpts());

    expect(mockAutoMinimizeComments).not.toHaveBeenCalled();
    expect(result.action).toBe("wait");
  });
  it("minimizes bot summaries but not GitHub-classified human summaries", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ reviewSummaries: [botSummary, humanSummary] }));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });
    const result = await runIterate(makeOpts());

    expect(mockAutoMinimizeComments).toHaveBeenCalledWith(["PRR_BOT"]);
    expect(result.action).toBe("wait");
  });
  it("minimizes only GitHub-classified bot summaries when minimizeComments=bots", async () => {
    const cfg = defaultConfig();
    cfg.iterate.minimizeComments = "bots";
    mockLoadConfig.mockReturnValue(cfg);
    mockRunCheck.mockResolvedValue(
      makeReport({
        reviewSummaries: [
          { ...botSummary, authorType: "Bot" },
          { ...humanSummary, authorType: "User" },
        ],
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(mockAutoMinimizeComments).toHaveBeenCalledWith(["PRR_BOT"]);
    expect(result.action).toBe("wait");
  });
  it("does not duplicate a rule-auto-resolve ID that already self-minimized as a seen summary", async () => {
    // botSummary is both an already-seen summary (self-minimize eligible) and
    // rule-matched (ruleAutoResolveReviewSummaryIds) — the two sets must stay
    // disjoint: it should self-minimize once, not also ride in --minimize-comment-ids.
    mockRunCheck.mockResolvedValue(
      makeReport({
        reviewSummaries: [botSummary],
        ruleAutoResolveReviewSummaryIds: ["PRR_BOT"],
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(mockAutoMinimizeComments).toHaveBeenCalledWith(["PRR_BOT"]);
    expect(result.action).toBe("wait");
  });
});
