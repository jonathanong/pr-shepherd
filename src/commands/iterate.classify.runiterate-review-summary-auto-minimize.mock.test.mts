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
  const WAIT_DELAY = { isReady: false, shouldCancel: false, remainingSeconds: 600 };
  const botSummary = makeReview("PRR_BOT", "copilot-pull-request-reviewer", "overview");
  const genericBotSummary = makeReview("PRR_GEM", "gemini-code-assist", "overview");
  const bracketBotSummary = makeReview("PRR_BRK", "github-actions[bot]", "overview");
  const humanSummary = {
    ...makeReview("PRR_HUMAN", "alice", "nice work"),
    authorType: "User" as const,
  };

  it("routes an already-seen bot summary to triage with a separate dismissReviewsCommand instead of auto-minimizing", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ reviewSummaries: [botSummary] }));
    mockUpdateReadyDelay.mockResolvedValue(WAIT_DELAY);

    const result = await runIterate(makeOpts());

    expect(mockAutoMinimizeComments).not.toHaveBeenCalled();
    expect(result.action).toBe("triage");
    if (result.action !== "triage") return;
    expect(result.triage.reviewSummaryIds).toEqual(["PRR_BOT"]);
    expect(result.triage.resolveCommand.hasMutations).toBe(false);
    expect(result.triage.dismissReviewsCommand?.argv).toContain("--minimize-comment-ids");
    expect(result.triage.dismissReviewsCommand?.argv).toContain("PRR_BOT");
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
    mockUpdateReadyDelay.mockResolvedValue(WAIT_DELAY);

    const result = await runIterate(makeOpts());

    expect(mockAutoMinimizeComments).not.toHaveBeenCalled();
    expect(result.action).toBe("triage");
    if (result.action !== "triage") return;
    expect(result.triage.reviewSummaryIds).toEqual([]);
    expect(result.triage.resolveCommand.argv).not.toContain("PRR_BOT");
    expect(result.triage.dismissReviewsCommand).toBeUndefined();
    expect(result.triage.resolveCommand.resolveThreadIds).toEqual(["thread-child"]);
  });
  it("classifies the `*[bot]` login suffix as a bot", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ reviewSummaries: [bracketBotSummary] }));
    mockUpdateReadyDelay.mockResolvedValue(WAIT_DELAY);
    const result = await runIterate(makeOpts());

    expect(mockAutoMinimizeComments).not.toHaveBeenCalled();
    expect(result.action).toBe("triage");
    if (result.action !== "triage") return;
    expect(result.triage.reviewSummaryIds).toEqual(["PRR_BRK"]);
    expect(result.triage.dismissReviewsCommand?.argv).toContain("PRR_BRK");
  });
  it("classifies known bot logins (gemini-code-assist) as bots", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ reviewSummaries: [genericBotSummary] }));
    mockUpdateReadyDelay.mockResolvedValue(WAIT_DELAY);
    const result = await runIterate(makeOpts());

    expect(mockAutoMinimizeComments).not.toHaveBeenCalled();
    expect(result.action).toBe("triage");
    if (result.action !== "triage") return;
    expect(result.triage.reviewSummaryIds).toEqual(["PRR_GEM"]);
    expect(result.triage.dismissReviewsCommand?.argv).toContain("PRR_GEM");
  });
  it("does not minimize GitHub-classified human summaries", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ reviewSummaries: [humanSummary] }));
    mockUpdateReadyDelay.mockResolvedValue(WAIT_DELAY);
    const result = await runIterate(makeOpts());

    expect(mockAutoMinimizeComments).not.toHaveBeenCalled();
    expect(result.action).toBe("wait");
  });
  it("minimizes bot summaries but not GitHub-classified human summaries", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ reviewSummaries: [botSummary, humanSummary] }));
    mockUpdateReadyDelay.mockResolvedValue(WAIT_DELAY);
    const result = await runIterate(makeOpts());

    expect(mockAutoMinimizeComments).not.toHaveBeenCalled();
    expect(result.action).toBe("triage");
    if (result.action !== "triage") return;
    expect(result.triage.reviewSummaryIds).toEqual(["PRR_BOT"]);
    expect(result.triage.dismissReviewsCommand?.argv).toContain("PRR_BOT");
    expect(result.triage.dismissReviewsCommand?.argv).not.toContain("PRR_HUMAN");
  });
  it("minimizes only GitHub-classified bot summaries when minimizeComments=bots", async () => {
    const cfg = defaultConfig();
    cfg.iterate["minimize-comments"] = "bots";
    mockLoadConfig.mockReturnValue(cfg);
    mockRunCheck.mockResolvedValue(
      makeReport({
        reviewSummaries: [
          { ...botSummary, authorType: "Bot" },
          { ...humanSummary, authorType: "User" },
        ],
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue(WAIT_DELAY);

    const result = await runIterate(makeOpts());

    expect(mockAutoMinimizeComments).not.toHaveBeenCalled();
    expect(result.action).toBe("triage");
    if (result.action !== "triage") return;
    expect(result.triage.reviewSummaryIds).toEqual(["PRR_BOT"]);
    expect(result.triage.dismissReviewsCommand?.argv).toContain("PRR_BOT");
  });
  it("dedupes a rule-auto-resolve ID that is also an already-seen summary", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        reviewSummaries: [botSummary],
        ruleAutoResolveReviewSummaryIds: ["PRR_BOT"],
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue(WAIT_DELAY);

    const result = await runIterate(makeOpts());

    expect(mockAutoMinimizeComments).not.toHaveBeenCalled();
    expect(result.action).toBe("triage");
    if (result.action !== "triage") return;
    expect(result.triage.reviewSummaryIds).toEqual(["PRR_BOT"]);
    const minimizeIdx =
      result.triage.dismissReviewsCommand?.argv.indexOf("--minimize-comment-ids") ?? -1;
    expect(minimizeIdx).toBeGreaterThan(-1);
    expect(result.triage.dismissReviewsCommand?.argv[minimizeIdx + 1]).toBe("PRR_BOT");
  });
});
