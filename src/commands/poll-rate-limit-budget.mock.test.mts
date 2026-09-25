import { describe, expect, it, vi } from "vitest";
import {
  makeCancelResult,
  makeWaitResult,
  mockRunIterate,
  registerPollHooks,
} from "../../test-helpers/commands/poll.test-support.mts";
import { GitHubRequestError } from "../github/errors.mts";
import { exhaustedPrimaryLimitDelayMs } from "./poll-rate-limit-delay.mts";
import { runPoll } from "./poll.mts";

registerPollHooks();

function exhausted(resetAt: number): GitHubRequestError {
  return new GitHubRequestError("API rate limit exceeded for user ID 4242", {
    status: 403,
    rateLimit: { resource: "graphql", remaining: 0, limit: 5000, resetAt },
  });
}

const opts = {
  prNumber: 7,
  targetRepository: { owner: "acme", name: "widgets" },
  format: "text" as const,
  intervalSeconds: 3600,
  timeoutSeconds: 0,
  untilTerminal: true,
};

describe("one-PR until-terminal rate-limit budget", () => {
  it("backs off on an unchanged resetAt and then succeeds", async () => {
    const resetAt = Math.floor(Date.now() / 1000) + 20;
    mockRunIterate
      .mockRejectedValueOnce(exhausted(resetAt))
      .mockRejectedValueOnce(exhausted(resetAt))
      .mockResolvedValueOnce(makeCancelResult());
    const pending = runPoll(opts);
    await vi.advanceTimersByTimeAsync(exhaustedPrimaryLimitDelayMs(resetAt, Date.now()));
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(pending).resolves.toMatchObject({ action: "cancel" });
  });

  it("does not shorten an explicit Retry-After on a no-progress retry", async () => {
    const retryAfter = new GitHubRequestError("You have exceeded a secondary rate limit", {
      status: 429,
      retryAfterSeconds: 60,
    });
    mockRunIterate
      .mockRejectedValueOnce(retryAfter)
      .mockRejectedValueOnce(retryAfter)
      .mockResolvedValueOnce(makeCancelResult());
    const pending = runPoll(opts);
    await vi.advanceTimersByTimeAsync(60_000);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(45_000);
    await expect(pending).resolves.toMatchObject({ action: "cancel" });
    expect(mockRunIterate).toHaveBeenCalledTimes(3);
  });

  it("sleeps again when the next error has a later resetAt", async () => {
    const resetAt = Math.floor(Date.now() / 1000) + 20;
    const later = resetAt + 40;
    mockRunIterate
      .mockRejectedValueOnce(exhausted(resetAt))
      .mockRejectedValueOnce(exhausted(later))
      .mockResolvedValueOnce(makeCancelResult());
    const pending = runPoll(opts);
    await vi.advanceTimersByTimeAsync(exhaustedPrimaryLimitDelayMs(resetAt, Date.now()));
    await vi.advanceTimersByTimeAsync(exhaustedPrimaryLimitDelayMs(later, Date.now()));
    await expect(pending).resolves.toMatchObject({ action: "cancel" });
    expect(mockRunIterate).toHaveBeenCalledTimes(3);
  });

  it("exits 75 on the fifth no-progress attempt and names the resource and reset time", async () => {
    const resetAt = Math.floor(Date.now() / 1000) + 20;
    mockRunIterate.mockRejectedValue(exhausted(resetAt));
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const pending = runPoll(opts);
    const assertion = expect(pending).rejects.toMatchObject({ exitCode: 75 });
    await vi.advanceTimersByTimeAsync(exhaustedPrimaryLimitDelayMs(resetAt, Date.now()));
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
    expect(mockRunIterate).toHaveBeenCalledTimes(6);
    const written = stderr.mock.calls.map((args) => String(args[0])).join("");
    const clock = `${new Date(resetAt * 1000).toISOString().slice(11, 19)}Z`;
    expect(written).toContain(`GitHub GraphQL rate limit (0/5000) still exhausted at ${clock}`);
    expect(written.match(/no progress/g)).toHaveLength(1);
  });

  it("treats the next rate limit after a success as a new first wait", async () => {
    const resetAt = Math.floor(Date.now() / 1000) + 80;
    mockRunIterate
      .mockRejectedValueOnce(exhausted(resetAt))
      .mockRejectedValueOnce(exhausted(resetAt))
      .mockResolvedValueOnce(makeWaitResult({ pr: 7, repo: "acme/widgets" }))
      .mockRejectedValueOnce(exhausted(resetAt))
      .mockResolvedValueOnce(makeCancelResult());
    const pending = runPoll(opts);
    await vi.advanceTimersByTimeAsync(exhaustedPrimaryLimitDelayMs(resetAt, Date.now()));
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.advanceTimersByTimeAsync(opts.intervalSeconds * 1000);
    let settled = false;
    const done = pending.then((result) => {
      settled = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(12_000);
    expect(settled).toBe(true);
    await expect(done).resolves.toMatchObject({ action: "cancel" });
  });
});
