import { describe, expect, it, vi } from "vitest";
import {
  makeCancelResult,
  makeWaitResult,
  mockRunIterate,
  registerPollHooks,
} from "../../test-helpers/commands/poll.test-support.mts";
import { GitHubRequestError } from "../github/errors.mts";
import { githubOperation, runWithGithubTransport } from "../github/transport.mts";
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

describe("runPoll transport-aware quota selection", () => {
  it("drops a pending GraphQL warning after auto fallback and continues at REST cadence", async () => {
    const quotaWarning = {
      resource: "graphql" as const,
      thresholdPercent: 10,
      remaining: 400,
      limit: 5000,
      resetAt: 1_700_000_000,
      pollIntervalMinutes: 10,
      pollTimeoutMinutes: 20,
    };
    mockRunIterate
      .mockResolvedValueOnce(makeWaitResult({ apiUsage: lowGraphqlUsage, quotaWarning }))
      .mockImplementationOnce(async () => {
        await githubOperation(
          "poll quota probe",
          async () => {
            throw new GitHubRequestError("primary GraphQL budget exhausted", {
              status: 403,
              rateLimit: { resource: "graphql", remaining: 0, limit: 5000, resetAt: 1_700_000_000 },
            });
          },
          async () => "REST snapshot",
        );
        return makeWaitResult({
          apiUsage: {
            ...lowGraphqlUsage,
            rest: [
              {
                resource: "core",
                requestCount: 1,
                limit: 5000,
                used: 100,
                remaining: 4900,
                resetAt: 1_700_000_000,
              },
            ],
          },
        });
      })
      .mockResolvedValue(makeCancelResult());

    const polling = runWithGithubTransport("auto", () =>
      runPoll({
        prNumber: 42,
        format: "text",
        intervalSeconds: 30,
        timeoutSeconds: 300,
        untilTerminal: false,
      }),
    );

    await vi.advanceTimersByTimeAsync(120_000);
    expect(mockRunIterate).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await polling).toMatchObject({ action: "cancel" });
    expect(mockRunIterate).toHaveBeenCalledTimes(3);
  });
});
