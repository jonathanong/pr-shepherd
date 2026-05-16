// @ts-nocheck
import { describe, it, expect, vi } from "vitest";
import { mockRunIterate, makeWaitResult, registerPollHooks } from "./poll.test-support.mts";
import { runPoll } from "./poll.mts";

registerPollHooks();

describe("runPoll — timeout returns final wait", () => {
  it("returns the last wait result when timeout would be exceeded", async () => {
    mockRunIterate.mockResolvedValue(makeWaitResult());

    // interval=30s, timeout=60s → after first wait: elapsed~0ms, next tick would put us at ~30s;
    // after second wait: elapsed~30s, next tick would put us at ~60s >= 60s, so loop exits.
    const pollPromise = runPoll({
      prNumber: 42,
      format: "text",
      intervalSeconds: 30,
      timeoutSeconds: 60,
    });

    await vi.advanceTimersByTimeAsync(30_000);

    const result = await pollPromise;

    expect(result.action).toBe("wait");
    // exactly 2 calls: first tick (elapsed~0, 0+30<60 → sleep), second tick (elapsed~30, 30+30>=60 → return)
    expect(mockRunIterate).toHaveBeenCalledTimes(2);
  });
});
