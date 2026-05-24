import { describe, it, expect, vi } from "vitest";
import {
  mockRunIterate,
  makeWaitResult,
  makeCancelResult,
  registerPollHooks,
} from "../../test-helpers/commands/poll.test-support.mts";
import { runPoll } from "./poll.mts";

registerPollHooks();

describe("runPoll — loops on wait then stops", () => {
  it("calls runIterate 3 times when it returns wait twice then cancel", async () => {
    mockRunIterate
      .mockResolvedValueOnce(makeWaitResult())
      .mockResolvedValueOnce(makeWaitResult())
      .mockResolvedValue(makeCancelResult());

    const pollPromise = runPoll({
      prNumber: 42,
      format: "text",
      intervalSeconds: 30,
      timeoutSeconds: 300,
    });

    // advance past each sleep
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(30_000);

    const result = await pollPromise;

    expect(result.action).toBe("cancel");
    expect(mockRunIterate).toHaveBeenCalledTimes(3);
  });

  it("forwards iterate opts to each runIterate call", async () => {
    mockRunIterate.mockResolvedValueOnce(makeWaitResult()).mockResolvedValue(makeCancelResult());

    const pollPromise = runPoll({
      prNumber: 42,
      format: "json",
      readyDelaySeconds: 600,
      stallTimeoutSeconds: 1800,
      noAutoMarkReady: true,
      noAutoCancelActionable: true,
      intervalSeconds: 30,
      timeoutSeconds: 300,
    });

    await vi.advanceTimersByTimeAsync(30_000);
    await pollPromise;

    expect(mockRunIterate).toHaveBeenCalledWith(
      expect.objectContaining({
        prNumber: 42,
        format: "json",
        readyDelaySeconds: 600,
        stallTimeoutSeconds: 1800,
        noAutoMarkReady: true,
        noAutoCancelActionable: true,
      }),
    );
  });
});
