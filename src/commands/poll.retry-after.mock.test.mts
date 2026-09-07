import { describe, it, expect, vi } from "vitest";
import {
  mockRunIterate,
  makeCancelResult,
  registerPollHooks,
} from "../../test-helpers/commands/poll.test-support.mts";
import { GitHubRequestError } from "../github/errors.mts";
import { runPoll } from "./poll.mts";

registerPollHooks();

describe("runPoll — GraphQL Retry-After", () => {
  it("retries once on until-terminal after Retry-After", async () => {
    mockRunIterate
      .mockRejectedValueOnce(
        new GitHubRequestError("You have exceeded a secondary rate limit", {
          status: 403,
          retryAfterSeconds: 10,
        }),
      )
      .mockResolvedValue(makeCancelResult());

    const pollPromise = runPoll({
      prNumber: 42,
      format: "text",
      intervalSeconds: 30,
      timeoutSeconds: 300,
      untilTerminal: true,
    });

    await vi.advanceTimersByTimeAsync(10_000);
    const result = await pollPromise;

    expect(mockRunIterate).toHaveBeenCalledTimes(2);
    expect(result.action).toBe("cancel");
  });

  it("throws after a second until-terminal rate-limit failure", async () => {
    const err = new GitHubRequestError("You have exceeded a secondary rate limit", {
      status: 403,
      retryAfterSeconds: 5,
    });
    mockRunIterate.mockRejectedValue(err);

    const pollPromise = runPoll({
      prNumber: 42,
      format: "text",
      intervalSeconds: 30,
      timeoutSeconds: 300,
      untilTerminal: true,
    });
    const assertion = expect(pollPromise).rejects.toMatchObject({ status: 403 });
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
    expect(mockRunIterate).toHaveBeenCalledTimes(2);
  });

  it("does not retry on a bounded poll", async () => {
    mockRunIterate.mockRejectedValueOnce(
      new GitHubRequestError("You have exceeded a secondary rate limit", {
        status: 403,
        retryAfterSeconds: 10,
      }),
    );

    await expect(
      runPoll({
        prNumber: 42,
        format: "text",
        intervalSeconds: 30,
        timeoutSeconds: 300,
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(mockRunIterate).toHaveBeenCalledTimes(1);
  });
});
