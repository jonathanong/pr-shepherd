import { describe, it, expect, vi } from "vitest";
import {
  mockRunIterate,
  makeWaitResult,
  registerPollHooks,
} from "../../test-helpers/commands/poll.test-support.mts";
import { runPoll } from "./poll.mts";

registerPollHooks();

async function runWaitPoll(
  intervalSeconds: number,
  timeoutSeconds: number,
  timerAdvancesMs: number[],
): Promise<void> {
  const pollPromise = runPoll({
    prNumber: 42,
    format: "text",
    intervalSeconds,
    timeoutSeconds,
  });

  for (const advanceMs of timerAdvancesMs) {
    await vi.advanceTimersByTimeAsync(advanceMs);
  }

  const result = await pollPromise;

  expect(result.action).toBe("wait");
}

describe("runPoll — timeout returns final wait", () => {
  it("returns the last wait result when the next full interval would exceed timeout", async () => {
    mockRunIterate.mockResolvedValue(makeWaitResult());

    // interval=60s, timeout=270s → ticks at t=0/60/120/180/240; at t=240 only
    // 30s remains, so poll returns instead of sleeping a pointless partial interval.
    await runWaitPoll(60, 270, [240_000]);

    expect(mockRunIterate).toHaveBeenCalledTimes(5);
  });

  it("runs a final wait tick when a full interval exactly fits the timeout", async () => {
    mockRunIterate.mockResolvedValue(makeWaitResult());

    // interval=30s, timeout=60s → tick1 at t=0 (sleep 30s), tick2 at t=30s (sleep 30s), tick3 at t=60s (remaining=0 → return)
    await runWaitPoll(30, 60, [60_000]);

    expect(mockRunIterate).toHaveBeenCalledTimes(3);
  });

  it("does not skip a final wait tick because of small timer drift", async () => {
    mockRunIterate.mockResolvedValue(makeWaitResult());

    await runWaitPoll(30, 60, [30_250, 30_000]);

    expect(mockRunIterate).toHaveBeenCalledTimes(3);
  });
});
