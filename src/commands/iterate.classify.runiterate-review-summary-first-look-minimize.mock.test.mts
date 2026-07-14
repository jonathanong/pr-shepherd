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
// Review summary minimize — first-look cases, plus the self-minimize failure
// fallback (issue #313).
//
// First-look summaries still need one fix_code tick to surface their body,
// unlike already-seen summaries which self-minimize in-process (see
// iterate.classify.runiterate-review-summary-auto-minimize.mock.test.mts).
// ---------------------------------------------------------------------------

describe("runIterate — review summary auto-minimize (first look)", () => {
  const botSummary = makeReview("PRR_BOT", "copilot-pull-request-reviewer", "overview");

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

    expect(mockAutoMinimizeComments).not.toHaveBeenCalled();
    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") return;
    expect(result.fix.firstLookSummaries).toEqual([summary]);
    expect(result.fix.reviewSummaryIds).toEqual([]);
    expect(result.fix.resolveCommand.hasMutations).toBe(false);
  });
  it("surfaces a first-look bot summary body under fix_code and includes it in the resolve command", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ firstLookSummaries: [botSummary] }));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(mockAutoMinimizeComments).not.toHaveBeenCalled();
    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") return;
    expect(result.fix.firstLookSummaries).toEqual([botSummary]);
    expect(result.fix.reviewSummaryIds).toEqual(["PRR_BOT"]);
    expect(result.fix.resolveCommand.argv).toContain("--minimize-comment-ids");
    expect(result.fix.resolveCommand.argv).toContain("PRR_BOT");
  });
  it("falls back to the agent-facing resolve command when self-minimize does not confirm success", async () => {
    // autoMinimizeComments reports per-ID failures via `errors`/`minimized` rather
    // than throwing (rate limit, null response, etc.) — an unconfirmed ID must not
    // silently vanish; it needs a working fallback path (issue #313 review comment).
    mockAutoMinimizeComments.mockResolvedValueOnce({
      minimized: [],
      errors: ["PRR_BOT: minimize returned null or comment not minimized"],
    });
    mockRunCheck.mockResolvedValue(makeReport({ reviewSummaries: [botSummary] }));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(mockAutoMinimizeComments).toHaveBeenCalledWith(["PRR_BOT"]);
    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") return;
    expect(result.fix.reviewSummaryIds).toEqual(["PRR_BOT"]);
    expect(result.fix.resolveCommand.argv).toContain("PRR_BOT");
  });
});
