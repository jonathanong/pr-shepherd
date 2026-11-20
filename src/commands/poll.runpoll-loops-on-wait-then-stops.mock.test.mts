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
      }),
    );
  });

  it("runs beforeTick ahead of every tick and stops when it throws", async () => {
    mockRunIterate.mockResolvedValue(makeWaitResult());
    const beforeTick = vi
      .fn()
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => {
        throw new Error("lost the lock");
      });
    const pollPromise = runPoll({
      prNumber: 42,
      format: "text",
      intervalSeconds: 30,
      timeoutSeconds: 300,
      beforeTick,
    });
    const rejected = expect(pollPromise).rejects.toThrow("lost the lock");
    await vi.advanceTimersByTimeAsync(30_000);
    await rejected;
    expect(beforeTick).toHaveBeenCalledTimes(2);
    expect(mockRunIterate).toHaveBeenCalledTimes(1);
    expect(mockRunIterate.mock.calls[0]![0]).not.toHaveProperty("beforeTick");
  });
});
