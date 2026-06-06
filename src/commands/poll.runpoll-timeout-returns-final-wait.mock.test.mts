import { describe, it, expect, vi } from "vitest";
import {
  mockRunIterate,
  makeWaitResult,
  registerPollHooks,
} from "../../test-helpers/commands/poll.test-support.mts";
import { runPoll } from "./poll.mts";

registerPollHooks();

describe("runPoll — timeout returns final wait", () => {
  it("returns the last wait result when the next full interval would exceed timeout", async () => {
    mockRunIterate.mockResolvedValue(makeWaitResult());

    // interval=60s, timeout=270s → ticks at t=0/60/120/180/240; at t=240 only
    // 30s remains, so poll returns instead of sleeping a pointless partial interval.
    const pollPromise = runPoll({
      prNumber: 42,
      format: "text",
      intervalSeconds: 60,
      timeoutSeconds: 270,
    });

    await vi.advanceTimersByTimeAsync(240_000);

    const result = await pollPromise;

    expect(result.action).toBe("wait");
    expect(mockRunIterate).toHaveBeenCalledTimes(5);
  });

  it("runs a final wait tick when a full interval exactly fits the timeout", async () => {
    mockRunIterate.mockResolvedValue(makeWaitResult());

    // interval=30s, timeout=60s → tick1 at t=0 (sleep 30s), tick2 at t=30s (sleep 30s), tick3 at t=60s (remaining=0 → return)
    const pollPromise = runPoll({
      prNumber: 42,
      format: "text",
      intervalSeconds: 30,
      timeoutSeconds: 60,
    });

    await vi.advanceTimersByTimeAsync(60_000);

    const result = await pollPromise;

    expect(result.action).toBe("wait");
    expect(mockRunIterate).toHaveBeenCalledTimes(3);
  });
});
