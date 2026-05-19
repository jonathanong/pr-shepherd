import { describe, it, expect } from "vitest";
import {
  registerIterateHooks,
  makeOpts,
  makeReport,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "./iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

describe("runIterate — cancel on merged/closed PR", () => {
  it("returns action: cancel and clears ready-delay when PR is MERGED", async () => {
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
    expect(mockUpdateReadyDelay).toHaveBeenCalledWith(42, false, 600, "owner", "repo");
  });

  it("returns action: cancel and clears ready-delay when PR is CLOSED", async () => {
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
    expect(mockUpdateReadyDelay).toHaveBeenCalledWith(42, false, 600, "owner", "repo");
  });
});
