// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerIterateHooks,
  makeOpts,
  makeReport,
  makeReview,
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

  it("editedSummaries are surfaced in fix_code but excluded from reviewSummaryIds (not re-minimized)", async () => {
    // A seen summary triggers fix_code (it needs minimizing); edited summary must NOT join the queue.
    const seenSummary = makeReview("PRR_SEEN", "copilot", "Old review.");
    const editedSummary = makeReview("PRR_ED", "copilot", "Updated.");
    mockRunCheck.mockResolvedValue(
      makeReport({ reviewSummaries: [seenSummary], editedSummaries: [editedSummary] }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") return;

    expect(result.fix.editedSummaries).toEqual([editedSummary]);
    expect(result.fix.reviewSummaryIds).toContain("PRR_SEEN");
    expect(result.fix.reviewSummaryIds).not.toContain("PRR_ED");
    expect(result.fix.instructions.join("\n")).toContain("edited since first look");
  });
  it("surfaces body in firstLookSummaries when summary comes from report.firstLookSummaries", async () => {
    const summary = makeReview("PRR_FL", "copilot", "Nice work.");
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
    expect(result.fix.reviewSummaryIds).toContain("PRR_FL");
  });
});
