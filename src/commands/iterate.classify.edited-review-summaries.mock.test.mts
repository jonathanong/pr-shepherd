import { describe, it, expect } from "vitest";
import {
  registerIterateHooks,
  makeOpts,
  makeReport,
  makeReview,
  mockAutoMinimizeComments,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

// ---------------------------------------------------------------------------
// Review summary minimize — issue #70
// ---------------------------------------------------------------------------

describe("runIterate — review summary auto-minimize", () => {
  it("editedSummaries are surfaced in triage without minimizing them, while the seen summary rides in dismissReviewsCommand", async () => {
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

    expect(mockAutoMinimizeComments).not.toHaveBeenCalled();
    expect(result.action).toBe("triage");
    if (result.action !== "triage") return;

    expect(result.triage.editedSummaries).toEqual([editedSummary]);
    expect(result.triage.reviewSummaryIds).toEqual(["PRR_SEEN"]);
    expect(result.triage.dismissReviewsCommand?.argv).toContain("PRR_SEEN");
    expect(result.triage.dismissReviewsCommand?.argv).not.toContain("PRR_ED");
    expect(result.triage.instructions.join("\n")).toContain("edited since first look");
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

    expect(result.action).toBe("triage");
    if (result.action !== "triage") return;

    expect(result.triage.firstLookSummaries).toEqual([summary]);
    expect(result.triage.reviewSummaryIds).toContain("PRR_FL");
  });
});
