import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubRequestError } from "../github/errors.mts";

vi.mock("../github/poll-summary.mts", () => ({ fetchPollSummary: vi.fn() }));
vi.mock("../github/client.mts", () => ({ getRepoInfo: vi.fn() }));

import { fetchPollSummary } from "../github/poll-summary.mts";
import { exhaustedPrimaryLimitDelayMs } from "./poll-rate-limit-delay.mts";
import { runAggregatePoll } from "./poll-summary.mts";

function exhausted(resetAt: number): GitHubRequestError {
  return new GitHubRequestError("API rate limit exceeded for user ID 4242", {
    status: 403,
    rateLimit: { resource: "graphql", remaining: 0, limit: 5000, resetAt },
  });
}

function terminalSummary() {
  return {
    selection: { kind: "prs" as const, requested: [7] },
    prs: [
      {
        pr: 7,
        repo: "acme/widgets",
        title: "PR 7",
        url: "https://github.com/acme/widgets/pull/7",
        action: "cancel" as const,
        reasons: ["merged"],
        state: "MERGED" as const,
        mergeable: "MERGEABLE" as const,
        mergeStateStatus: "CLEAN" as const,
        headRefName: "feature-7",
        headRefOid: "b".repeat(40),
        baseRefName: "main",
      },
    ],
  };
}

const opts = {
  prNumbers: [7],
  targetRepository: { owner: "acme", name: "widgets" },
  intervalSeconds: 3600,
  timeoutSeconds: 0,
  debounceSeconds: 0,
  untilTerminal: true,
};

describe("aggregate until-terminal rate-limit budget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("backs off on an unchanged resetAt and then succeeds", async () => {
    const resetAt = Math.floor(Date.now() / 1000) + 20;
    vi.mocked(fetchPollSummary)
      .mockRejectedValueOnce(exhausted(resetAt))
      .mockRejectedValueOnce(exhausted(resetAt))
      .mockResolvedValueOnce(terminalSummary());
    const pending = runAggregatePoll(opts);
    await vi.advanceTimersByTimeAsync(exhaustedPrimaryLimitDelayMs(resetAt, Date.now()));
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(pending).resolves.toMatchObject({ reason: "all_terminal" });
    expect(fetchPollSummary).toHaveBeenCalledTimes(3);
  });

  it("sleeps again when the next error has a later resetAt", async () => {
    const resetAt = Math.floor(Date.now() / 1000) + 20;
    const later = resetAt + 40;
    vi.mocked(fetchPollSummary)
      .mockRejectedValueOnce(exhausted(resetAt))
      .mockRejectedValueOnce(exhausted(later))
      .mockResolvedValueOnce(terminalSummary());
    const pending = runAggregatePoll(opts);
    await vi.advanceTimersByTimeAsync(exhaustedPrimaryLimitDelayMs(resetAt, Date.now()));
    await vi.advanceTimersByTimeAsync(exhaustedPrimaryLimitDelayMs(later, Date.now()));
    await expect(pending).resolves.toMatchObject({ reason: "all_terminal" });
    expect(fetchPollSummary).toHaveBeenCalledTimes(3);
  });

  it("exits 75 on the fifth no-progress attempt and names the resource and reset time", async () => {
    const resetAt = Math.floor(Date.now() / 1000) + 20;
    vi.mocked(fetchPollSummary).mockRejectedValue(exhausted(resetAt));
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const pending = runAggregatePoll(opts);
    const assertion = expect(pending).rejects.toMatchObject({ exitCode: 75 });
    await vi.advanceTimersByTimeAsync(exhaustedPrimaryLimitDelayMs(resetAt, Date.now()));
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
    expect(fetchPollSummary).toHaveBeenCalledTimes(6);
    const written = stderr.mock.calls.map((args) => String(args[0])).join("");
    const clock = `${new Date(resetAt * 1000).toISOString().slice(11, 19)}Z`;
    expect(written).toContain(`GitHub GraphQL rate limit (0/5000) still exhausted at ${clock}`);
    expect(written.match(/no progress/g)).toHaveLength(1);
  });
});
