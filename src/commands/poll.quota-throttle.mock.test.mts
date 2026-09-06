import { describe, it, expect, vi } from "vitest";
import {
  mockRunIterate,
  makeWaitResult,
  makeCancelResult,
  makeMarkReadyResult,
  registerPollHooks,
} from "../../test-helpers/commands/poll.test-support.mts";
import { runPoll } from "./poll.mts";

registerPollHooks();

const lowGraphqlUsage = {
  credentialSources: ["env"],
  graphql: {
    resource: "graphql" as const,
    requestCount: 1,
    limit: 5000,
    used: 3750,
    remaining: 1250,
    resetAt: 1_700_000_000,
    measuredQueryCost: 4,
    unmeasuredRequestCount: 0,
    nodeCount: 200,
  },
};

describe("runPoll — GraphQL quota throttle", () => {
  it("lengthens WAIT sleeps to the crossed quota band", async () => {
    mockRunIterate
      .mockResolvedValueOnce(makeWaitResult({ apiUsage: lowGraphqlUsage }))
      .mockResolvedValue(makeCancelResult());

    const pollPromise = runPoll({
      prNumber: 42,
      format: "text",
      intervalSeconds: 30,
      timeoutSeconds: 300,
      untilTerminal: true,
    });

    await vi.advanceTimersByTimeAsync(30_000);
    expect(mockRunIterate).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(90_000);
    const result = await pollPromise;

    expect(mockRunIterate).toHaveBeenCalledTimes(2);
    expect(result.action).toBe("cancel");
  });

  it("lengthens MARK_READY sleeps to the crossed quota band", async () => {
    mockRunIterate
      .mockResolvedValueOnce(makeMarkReadyResult({ apiUsage: lowGraphqlUsage }))
      .mockResolvedValue(makeCancelResult());

    const pollPromise = runPoll({
      prNumber: 42,
      format: "text",
      intervalSeconds: 30,
      timeoutSeconds: 300,
      untilTerminal: true,
    });

    await vi.advanceTimersByTimeAsync(30_000);
    expect(mockRunIterate).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(90_000);
    const result = await pollPromise;

    expect(mockRunIterate).toHaveBeenCalledTimes(2);
    expect(result.action).toBe("cancel");
  });
});
