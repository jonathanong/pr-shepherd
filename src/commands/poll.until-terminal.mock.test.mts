import { describe, it, expect, vi } from "vitest";
import {
  mockRunIterate,
  makeWaitResult,
  makeCancelResult,
  makeFixCodeResult,
  makeMarkReadyResult,
  registerPollHooks,
} from "../../test-helpers/commands/poll.test-support.mts";
import { runPoll } from "./poll.mts";

registerPollHooks();

describe("runPoll — until-terminal mode", () => {
  it("stops on MARK_READY without --until-terminal", async () => {
    mockRunIterate
      .mockResolvedValueOnce(makeMarkReadyResult())
      .mockResolvedValue(makeCancelResult());

    const result = await runPoll({
      prNumber: 42,
      format: "text",
      intervalSeconds: 30,
      timeoutSeconds: 300,
    });

    expect(mockRunIterate).toHaveBeenCalledTimes(1);
    expect(result.action).toBe("mark_ready");
  });

  it("keeps polling WAIT ticks beyond timeout", async () => {
    mockRunIterate
      .mockResolvedValueOnce(makeWaitResult())
      .mockResolvedValueOnce(makeWaitResult())
      .mockResolvedValue(makeCancelResult());

    const pollPromise = runPoll({
      prNumber: 42,
      format: "text",
      intervalSeconds: 30,
      timeoutSeconds: 1,
      untilTerminal: true,
    });

    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pollPromise;

    expect(mockRunIterate).toHaveBeenCalledTimes(3);
    expect(result.action).toBe("cancel");
  });

  it("keeps polling after MARK_READY", async () => {
    mockRunIterate
      .mockResolvedValueOnce(makeMarkReadyResult())
      .mockResolvedValue(makeCancelResult());

    const pollPromise = runPoll({
      prNumber: 42,
      format: "text",
      intervalSeconds: 30,
      timeoutSeconds: 300,
      untilTerminal: true,
    });

    await vi.advanceTimersByTimeAsync(30_000);
    const result = await pollPromise;

    expect(mockRunIterate).toHaveBeenCalledTimes(2);
    expect(result.action).toBe("cancel");
  });

  it("still stops on FIX_CODE", async () => {
    mockRunIterate.mockResolvedValueOnce(makeWaitResult()).mockResolvedValue(makeFixCodeResult());

    const pollPromise = runPoll({
      prNumber: 42,
      format: "text",
      intervalSeconds: 30,
      timeoutSeconds: 300,
      debounceSeconds: 0,
      untilTerminal: true,
    });

    await vi.advanceTimersByTimeAsync(30_000);
    const result = await pollPromise;

    expect(mockRunIterate).toHaveBeenCalledTimes(2);
    expect(result.action).toBe("fix_code");
  });

  it("returns a WAIT immediately when until-terminal crosses a quota warning", async () => {
    const quotaWarning = {
      resource: "graphql" as const,
      thresholdPercent: 20,
      remaining: 900,
      limit: 5000,
      resetAt: 1_700_000_000,
      pollIntervalMinutes: 5,
      pollTimeoutMinutes: 10,
    };
    mockRunIterate.mockResolvedValueOnce(makeWaitResult({ quotaWarning }));

    const result = await runPoll({
      prNumber: 42,
      format: "text",
      intervalSeconds: 30,
      timeoutSeconds: 300,
      untilTerminal: true,
    });

    expect(mockRunIterate).toHaveBeenCalledTimes(1);
    expect(mockRunIterate).toHaveBeenCalledWith(
      expect.objectContaining({ deferQuotaWarning: false }),
    );
    expect(result.action).toBe("wait");
    expect(result.quotaWarning).toEqual(quotaWarning);
  });

  it("returns MARK_READY when its continued poll crosses a quota warning", async () => {
    const quotaWarning = {
      resource: "graphql" as const,
      thresholdPercent: 30,
      remaining: 1400,
      limit: 5000,
      resetAt: 1_700_000_000,
      pollIntervalMinutes: 2,
      pollTimeoutMinutes: 4,
    };
    mockRunIterate.mockResolvedValueOnce({ ...makeMarkReadyResult(), quotaWarning });

    const result = await runPoll({
      prNumber: 42,
      format: "text",
      intervalSeconds: 30,
      timeoutSeconds: 300,
      untilTerminal: true,
    });

    expect(mockRunIterate).toHaveBeenCalledTimes(1);
    expect(result.action).toBe("mark_ready");
    expect(result.quotaWarning).toEqual(quotaWarning);
  });
});
