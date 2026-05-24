import { describe, it, expect, vi } from "vitest";
import {
  mockRunIterate,
  makeWaitResult,
  makeCancelResult,
  registerPollHooks,
} from "../../test-helpers/commands/poll.test-support.mts";
import { runPoll } from "./poll.mts";

registerPollHooks();

const MAX_TIMER_MS = 2 ** 31 - 1;

describe("runPoll — clamps oversized timer values", () => {
  it("clamps a huge interval to MAX_TIMER_MS so setTimeout does not wrap to 1ms", async () => {
    mockRunIterate.mockResolvedValueOnce(makeWaitResult()).mockResolvedValue(makeCancelResult());

    // 1000h = 3,600,000,000 ms, which exceeds MAX_TIMER_MS
    const pollPromise = runPoll({
      prNumber: 42,
      format: "text",
      intervalSeconds: 1000 * 3600,
      timeoutSeconds: 1000 * 3600 * 2,
    });

    // Advancing by MAX_TIMER_MS should unblock the sleep since the interval is clamped
    await vi.advanceTimersByTimeAsync(MAX_TIMER_MS);
    const result = await pollPromise;

    expect(result.action).toBe("cancel");
    expect(mockRunIterate).toHaveBeenCalledTimes(2);
  });
});
