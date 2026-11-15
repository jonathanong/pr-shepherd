import { describe, it, expect, vi } from "vitest";
import {
  mockRunIterate,
  makeWaitResult,
  makeCancelResult,
  makeTriageResult,
  makeMarkReadyResult,
  registerPollHooks,
} from "../../test-helpers/commands/poll.test-support.mts";
import { runPoll } from "./poll.mts";
registerPollHooks();

const opts = {
  prNumber: 42,
  format: "text" as const,
  intervalSeconds: 60,
  timeoutSeconds: 1,
  debounceSeconds: 60,
  untilTerminal: true,
};

describe("runPoll — until-terminal after the TRIAGE debounce", () => {
  it("keeps polling when the post-debounce tick is WAIT", async () => {
    mockRunIterate
      .mockResolvedValueOnce(makeTriageResult())
      .mockResolvedValueOnce(makeWaitResult())
      .mockResolvedValue(makeCancelResult());
    const pollPromise = runPoll(opts);
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pollPromise;
    expect(result.action).toBe("cancel");
    expect(mockRunIterate).toHaveBeenCalledTimes(3);
  });

  it("keeps polling when the post-debounce tick is MARK_READY", async () => {
    mockRunIterate
      .mockResolvedValueOnce(makeTriageResult())
      .mockResolvedValueOnce(makeMarkReadyResult())
      .mockResolvedValue(makeCancelResult());
    const pollPromise = runPoll(opts);
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pollPromise;
    expect(result.action).toBe("cancel");
    expect(mockRunIterate).toHaveBeenCalledTimes(3);
  });
});
