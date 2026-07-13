import { describe, it, expect, vi } from "vitest";
import {
  registerIterateHooks,
  mockGetCurrentPrNumber,
  mockRunCheck,
  makeReport,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runPoll } from "./poll.mts";

// Regression test for https://github.com/jonathanong/pr-shepherd/issues/311.
//
// Unlike the other poll.*.mock.test.mts files, this test does NOT mock runIterate — it drives
// the real runIterate (via the iterate test harness, which mocks runCheck/getCurrentPrNumber
// instead) so the branch-inference bug can actually reproduce.

registerIterateHooks();

describe("runPoll — pins an inferred PR after the first tick", () => {
  it("reports the terminal merged result instead of re-inferring and throwing", async () => {
    // Branch inference resolves PR 123 exactly once. A second call (the bug path) would return
    // null, since the PR has left the `states: OPEN` set the branch query filters on.
    mockGetCurrentPrNumber.mockResolvedValueOnce(123).mockResolvedValue(null);

    mockRunCheck
      .mockResolvedValueOnce(makeReport({ pr: 123 })) // tick 1: OPEN -> WAIT
      .mockResolvedValueOnce(
        makeReport({
          pr: 123,
          mergeStatus: {
            status: "CLEAN",
            state: "MERGED",
            isDraft: false,
            mergeable: "MERGEABLE",
            reviewDecision: "APPROVED",
            blockingBotReviewInProgress: false,
            mergeStateStatus: "CLEAN",
          },
        }), // tick 2: MERGED -> terminal cancel
      );

    const pollPromise = runPoll({
      format: "json",
      intervalSeconds: 30,
      timeoutSeconds: 300,
      untilTerminal: true,
    });

    await vi.advanceTimersByTimeAsync(30_000);
    const result = await pollPromise;

    expect(mockGetCurrentPrNumber).toHaveBeenCalledTimes(1);
    expect(mockRunCheck).toHaveBeenCalledTimes(2);
    expect(result.action).toBe("cancel");
    expect(result.pr).toBe(123);
    if (result.action !== "cancel") throw new Error("expected cancel result");
    expect(result.reason).toBe("merged");
  });
});
