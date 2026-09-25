import { describe, it, expect } from "vitest";
import {
  registerIterateHooks,
  makeOpts,
  makeReport,
  mockRunCheck,
  mockClearReadyDelay,
  mockClearReadyReceipt,
  mockUpdateReadyDelay,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

describe("runIterate — cancel on merged/closed PR", () => {
  it("returns action: cancel and clears ready state when PR is MERGED", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "MERGED",
        mergeStatus: {
          status: "UNKNOWN",
          state: "MERGED",
          isDraft: false,
          mergeable: "UNKNOWN",
          reviewDecision: null,
          blockingBotReviewInProgress: false,
          mergeStateStatus: "UNKNOWN",
        },
      }),
    );

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("cancel");
    expect(result.status).toBe("MERGED");
    expect(result.state).toBe("MERGED");
    expect(mockClearReadyDelay).toHaveBeenCalledWith(42, "owner", "repo");
    expect(mockClearReadyReceipt).toHaveBeenCalledWith({ owner: "owner", repo: "repo", pr: 42 });
    expect(mockUpdateReadyDelay).not.toHaveBeenCalled();
  });

  it("returns action: cancel and clears ready state when PR is CLOSED", async () => {
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "CLOSED",
        mergeStatus: {
          status: "UNKNOWN",
          state: "CLOSED",
          isDraft: false,
          mergeable: "UNKNOWN",
          reviewDecision: null,
          blockingBotReviewInProgress: false,
          mergeStateStatus: "UNKNOWN",
        },
      }),
    );

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("cancel");
    expect(result.status).toBe("CLOSED");
    expect(result.state).toBe("CLOSED");
    expect(mockClearReadyDelay).toHaveBeenCalledWith(42, "owner", "repo");
    expect(mockClearReadyReceipt).toHaveBeenCalledWith({ owner: "owner", repo: "repo", pr: 42 });
    expect(mockUpdateReadyDelay).not.toHaveBeenCalled();
  });
});
