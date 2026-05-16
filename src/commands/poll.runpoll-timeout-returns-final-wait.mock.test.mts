// @ts-nocheck
import { describe, it, expect, vi } from "vitest";
import { mockRunIterate, makeWaitResult, registerPollHooks } from "./poll.test-support.mts";
import { runPoll } from "./poll.mts";

registerPollHooks();

describe("runPoll — timeout returns final wait", () => {
  it("returns the last wait result when timeout is exhausted", async () => {
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
