import { describe, it, expect } from "vitest";
import {
  registerIterateHooks,
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

// ---------------------------------------------------------------------------
// Review summary minimize — issue #70
// ---------------------------------------------------------------------------

describe("runIterate — review summary auto-minimize", () => {
  const botSummary = makeReview("PRR_BOT", "copilot-pull-request-reviewer", "overview");
  const genericBotSummary = makeReview("PRR_GEM", "gemini-code-assist", "overview");
  const bracketBotSummary = makeReview("PRR_BRK", "github-actions[bot]", "overview");
  const humanSummary = makeReview("PRR_HUMAN", "alice", "nice work");

  it("emits fix_code with reviewSummaryIds when only a bot summary exists", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ reviewSummaries: [botSummary] }));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") return;

    expect(result.fix.reviewSummaryIds).toEqual(["PRR_BOT"]);
    expect(result.fix.surfacedApprovals).toEqual([]);
    expect(result.fix.resolveCommand.argv).toContain("--minimize-comment-ids");
    expect(result.fix.resolveCommand.argv).toContain("PRR_BOT");
    expect(result.fix.resolveCommand.requiresHeadSha).toBe(false);
  });
  it("classifies the `*[bot]` login suffix as a bot", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ reviewSummaries: [bracketBotSummary] }));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });
    const result = await runIterate(makeOpts());
    if (result.action !== "fix_code") return;

    expect(result.fix.reviewSummaryIds).toEqual(["PRR_BRK"]);
  });
  it("classifies known bot logins (gemini-code-assist) as bots", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ reviewSummaries: [genericBotSummary] }));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });
    const result = await runIterate(makeOpts());
    if (result.action !== "fix_code") return;

    expect(result.fix.reviewSummaryIds).toEqual(["PRR_GEM"]);
  });
  it("always minimizes human summaries regardless of author type", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ reviewSummaries: [humanSummary] }));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });
    const result = await runIterate(makeOpts());
    if (result.action !== "fix_code") return;

    expect(result.fix.reviewSummaryIds).toEqual(["PRR_HUMAN"]);
    expect(result.fix.surfacedApprovals).toEqual([]);
  });
  it("minimizes both bot and human summaries unconditionally", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ reviewSummaries: [botSummary, humanSummary] }));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });
    const result = await runIterate(makeOpts());
    if (result.action !== "fix_code") return;

    expect(result.fix.reviewSummaryIds).toEqual(["PRR_BOT", "PRR_HUMAN"]);
    expect(result.fix.surfacedApprovals).toEqual([]);
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

    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") return;
    expect(result.fix.reviewSummaryIds).toEqual(["PRR_BOT"]);
    expect(result.fix.resolveCommand.argv).toContain("PRR_BOT");
    expect(result.fix.resolveCommand.argv).not.toContain("PRR_HUMAN");
  });
  it("surfaces first-look summaries without minimization when minimizeComments=none", async () => {
    const cfg = defaultConfig();
    cfg.iterate.minimizeComments = "none";
    mockLoadConfig.mockReturnValue(cfg);
    const summary = { id: "PRR_FL", author: "alice", authorType: "User" as const, body: "FYI" };
    mockRunCheck.mockResolvedValue(makeReport({ firstLookSummaries: [summary] }));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") return;
    expect(result.fix.firstLookSummaries).toEqual([summary]);
    expect(result.fix.reviewSummaryIds).toEqual([]);
    expect(result.fix.resolveCommand.hasMutations).toBe(false);
  });
});
