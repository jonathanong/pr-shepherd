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
  it("editedSummaries are surfaced in fix_code (triggered by the edit); the seen summary self-minimizes instead of joining the queue", async () => {
    // The edited summary triggers fix_code on its own; the seen summary has no new
    // content to surface, so the CLI self-minimizes it in-process (issue #313)
    // rather than routing it through the agent-facing resolve command.
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

    expect(mockAutoMinimizeComments).toHaveBeenCalledWith(["PRR_SEEN"]);
    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") return;

    expect(result.fix.editedSummaries).toEqual([editedSummary]);
    expect(result.fix.reviewSummaryIds).toEqual([]);
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
