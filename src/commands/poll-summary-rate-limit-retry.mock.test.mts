import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubRequestError } from "../github/errors.mts";

vi.mock("../util/sleep.mts", () => ({ sleep: vi.fn(async () => undefined) }));
vi.mock("../github/poll-summary.mts", () => ({ fetchPollSummary: vi.fn() }));
vi.mock("../github/client.mts", () => ({ getRepoInfo: vi.fn() }));

import { fetchPollSummary } from "../github/poll-summary.mts";
import { runAggregatePoll } from "./poll-summary.mts";

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

describe("aggregate until-terminal rate-limit stderr", () => {
  afterEach(() => vi.restoreAllMocks());

  it("names REST core and the reset time instead of GraphQL", async () => {
    vi.mocked(fetchPollSummary)
      .mockRejectedValueOnce(coreExhausted())
      .mockResolvedValueOnce({
        selection: { kind: "prs", requested: [15] },
        prs: [
          {
            pr: 15,
            repo: "acme/widgets",
            title: "PR 15",
            url: "https://github.com/acme/widgets/pull/15",
            action: "cancel",
            reasons: ["merged"],
            state: "MERGED",
            mergeable: "MERGEABLE",
            mergeStateStatus: "CLEAN",
            headRefName: "feature-15",
            headRefOid: "1".repeat(40),
            baseRefName: "main",
          },
        ],
      });
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await runAggregatePoll({
      prNumbers: [15],
      targetRepository: { owner: "acme", name: "widgets" },
      intervalSeconds: 60,
      timeoutSeconds: 0,
      debounceSeconds: 0,
      untilTerminal: true,
    });

    const written = stderr.mock.calls.map((args) => String(args[0])).join("");
    expect(written).toContain("GitHub REST core rate limit (0/5000)");
    expect(written).toMatch(/retrying at \d{2}:\d{2}:\d{2}Z \(in \d+s\)/);
    expect(written).not.toContain("GraphQL rate limit");
  });
});
