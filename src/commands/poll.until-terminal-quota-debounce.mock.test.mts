import { describe, expect, it, vi } from "vitest";
import {
  makeCancelResult,
  makeFixCodeResult,
  makeWaitResult,
  mockRunIterate,
  registerPollHooks,
} from "../../test-helpers/commands/poll.test-support.mts";
import { runPoll } from "./poll.mts";

registerPollHooks();

const quotaWarning = {
  resource: "graphql" as const,
  thresholdPercent: 20,
  remaining: 900,
  limit: 5000,
  resetAt: 1_700_000_000,
  pollIntervalMinutes: 5,
  pollTimeoutMinutes: 10,
};

function runUntilTerminalPoll() {
  return runPoll({
    prNumber: 42,
    format: "text",
    intervalSeconds: 30,
    timeoutSeconds: 300,
    debounceSeconds: 60,
    untilTerminal: true,
  });
}

describe("runPoll — until-terminal quota warnings during debounce", () => {
  it("returns a fix warning only after a persisted post-debounce tick", async () => {
    mockRunIterate
      .mockResolvedValueOnce({ ...makeFixCodeResult(), quotaWarning })
      .mockResolvedValueOnce(makeFixCodeResult())
      .mockResolvedValueOnce(makeFixCodeResult());

    const pollPromise = runUntilTerminalPoll();
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pollPromise;

    expect(mockRunIterate).toHaveBeenCalledTimes(3);
    expect(mockRunIterate.mock.calls[0]?.[0].persistSeen).toBe(false);
    expect(mockRunIterate.mock.calls[2]?.[0].persistSeen).toBe(true);
    expect(result.action).toBe("fix_code");
    expect(result.quotaWarning).toEqual(quotaWarning);
  });

  it("keeps debounce state through interim waits before returning the warning", async () => {
    mockRunIterate
      .mockResolvedValueOnce({ ...makeFixCodeResult(), quotaWarning })
      .mockResolvedValueOnce(makeWaitResult())
      .mockResolvedValueOnce(makeWaitResult());

    const pollPromise = runUntilTerminalPoll();
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pollPromise;

    expect(mockRunIterate).toHaveBeenCalledTimes(3);
    expect(mockRunIterate.mock.calls[2]?.[0].persistSeen).toBe(true);
    expect(result.action).toBe("wait");
    expect(result.quotaWarning).toEqual(quotaWarning);
  });

  it("returns the strictest warning crossed during debounce", async () => {
    const stricterWarning = {
      ...quotaWarning,
      thresholdPercent: 10,
      remaining: 400,
      pollIntervalMinutes: 10,
      pollTimeoutMinutes: 20,
    };
    mockRunIterate
      .mockResolvedValueOnce({ ...makeFixCodeResult(), quotaWarning })
      .mockResolvedValueOnce({ ...makeFixCodeResult(), quotaWarning: stricterWarning })
      .mockResolvedValueOnce(makeFixCodeResult());

    const pollPromise = runUntilTerminalPoll();
    await vi.advanceTimersByTimeAsync(60_000);

    await expect(pollPromise).resolves.toMatchObject({ quotaWarning: stricterWarning });
  });

  it("lets a terminal result win without a pending fix warning", async () => {
    mockRunIterate
      .mockResolvedValueOnce({ ...makeFixCodeResult(), quotaWarning })
      .mockResolvedValueOnce(makeFixCodeResult())
      .mockResolvedValueOnce(makeCancelResult());

    const pollPromise = runUntilTerminalPoll();
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pollPromise;

    expect(result.action).toBe("cancel");
    expect(result.quotaWarning).toBeUndefined();
  });
});
