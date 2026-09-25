import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubRequestError } from "../github/errors.mts";
import {
  makeCancelResult,
  mockRunIterate,
  registerPollHooks,
} from "../../test-helpers/commands/poll.test-support.mts";

vi.mock("../util/sleep.mts", () => ({ sleep: vi.fn(async () => undefined) }));

import { runPoll } from "./poll.mts";

registerPollHooks();

function coreExhausted(): GitHubRequestError {
  return new GitHubRequestError("API rate limit exceeded for user ID 4242", {
    status: 403,
    rateLimit: {
      resource: "core",
      remaining: 0,
      limit: 5000,
      resetAt: Math.floor(Date.now() / 1000) + 3248,
    },
  });
}

describe("until-terminal rate-limit stderr", () => {
  afterEach(() => vi.restoreAllMocks());

  it("names REST core and the reset time for a one-PR poll", async () => {
    mockRunIterate.mockRejectedValueOnce(coreExhausted()).mockResolvedValueOnce(makeCancelResult());
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await runPoll({
      prNumber: 15,
      format: "text",
      intervalSeconds: 60,
      timeoutSeconds: 0,
      untilTerminal: true,
    });

    const written = stderr.mock.calls.map((args) => String(args[0])).join("");
    expect(written).toContain("GitHub REST core rate limit (0/5000)");
    expect(written).toMatch(/retrying at \d{2}:\d{2}:\d{2}Z \(in \d+s\)/);
    expect(written).not.toContain("GraphQL rate limit");
  });

  it("retries one until-terminal tick when annotation fetch throws a GraphQL rate limit", async () => {
    mockRunIterate
      .mockRejectedValueOnce(
        new GitHubRequestError(
          "GitHub GraphQL error (no data): API rate limit already exceeded for user ID 12345.",
          {
            status: 200,
            rateLimit: {
              resource: "graphql",
              remaining: 0,
              limit: 5000,
              resetAt: Math.floor(Date.now() / 1000) + 60,
            },
          },
        ),
      )
      .mockResolvedValueOnce(makeCancelResult());
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const result = await runPoll({
      prNumber: 7,
      format: "text",
      intervalSeconds: 60,
      timeoutSeconds: 0,
      untilTerminal: true,
    });

    expect(result.action).toBe("cancel");
    expect(mockRunIterate).toHaveBeenCalledTimes(2);
    const written = stderr.mock.calls.map((args) => String(args[0])).join("");
    expect(written).toContain("GitHub GraphQL rate limit (0/5000)");
    expect(written).toMatch(/retrying at \d{2}:\d{2}:\d{2}Z \(in \d+s\)/);
    expect(written).not.toContain("annotation fetch failed");
  });
});
