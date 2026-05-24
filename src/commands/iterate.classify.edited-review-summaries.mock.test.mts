import { describe, it, expect } from "vitest";
import {
  registerIterateHooks,
  makeOpts,
  makeReport,
  makeReview,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

// ---------------------------------------------------------------------------
// Review summary minimize — issue #70
// ---------------------------------------------------------------------------

describe("runIterate — review summary auto-minimize", () => {
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
