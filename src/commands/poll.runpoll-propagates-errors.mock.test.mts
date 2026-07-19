import { describe, expect, it } from "vitest";
import {
  mockRunIterate,
  registerPollHooks,
} from "../../test-helpers/commands/poll.test-support.mts";
import { GitHubRequestError } from "../github/errors.mts";
import { runPoll } from "./poll.mts";

registerPollHooks();

describe("runPoll — error propagation", () => {
  it("fails immediately when an iteration cannot obtain a complete GitHub snapshot", async () => {
    const error = new GitHubRequestError(
      "GitHub GraphQL error: Resource not accessible by personal access token",
      { status: 200 },
    );
    mockRunIterate.mockRejectedValue(error);

    await expect(
      runPoll({
        prNumber: 42,
        format: "text",
        intervalSeconds: 30,
        timeoutSeconds: 300,
      }),
    ).rejects.toBe(error);
    expect(mockRunIterate).toHaveBeenCalledTimes(1);
  });
});
