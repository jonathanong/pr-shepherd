import { describe, expect, it, vi } from "vitest";
import {
  makeCancelResult,
  mockRunIterate,
  registerPollHooks,
} from "../../test-helpers/commands/poll.test-support.mts";
import { formatIterateResult } from "../cli/iterate-formatter.mts";
import { projectIterateLean } from "../cli/iterate-lean.mts";
import { GitHubRequestError } from "../github/errors.mts";
import { exhaustedPrimaryLimitDelayMs } from "./poll-rate-limit-delay.mts";

vi.mock("../github/rest-http.mts", () => ({ rest: vi.fn(), restWithRateLimit: vi.fn() }));

import { rest } from "../github/rest-http.mts";
import { runPoll } from "./poll.mts";

registerPollHooks();

function exhausted(resetAt: number, resource = "graphql"): GitHubRequestError {
  return new GitHubRequestError("API rate limit exceeded for user ID 4242", {
    status: 403,
    rateLimit: { resource, remaining: 0, limit: 5000, resetAt },
  });
}

const opts = {
  prNumber: 7,
  targetRepository: { owner: "acme", name: "widgets" },
  format: "text" as const,
  intervalSeconds: 60,
  timeoutSeconds: 0,
  untilTerminal: true,
};

function mergedPull() {
  return {
    merged: true,
    state: "closed",
    title: "Add widget export",
    html_url: "https://github.com/acme/widgets/pull/7",
    mergeable_state: "clean",
    base: { ref: "main" },
    head: { ref: "feature-7", sha: "a".repeat(40) },
  };
}

describe("one-PR rate-limit sleep probe", () => {
  it("returns CANCEL when a mid-sleep REST pull is merged", async () => {
    const started = Date.now();
    const resetAt = Math.floor(started / 1000) + 180;
    expect(exhaustedPrimaryLimitDelayMs(resetAt, started)).toBeGreaterThan(60_000);
    vi.mocked(rest).mockResolvedValue(mergedPull());
    mockRunIterate.mockRejectedValueOnce(exhausted(resetAt));
    const pending = runPoll(opts);
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pending;
    expect(Date.now() - started).toBe(60_000);
    expect(rest).toHaveBeenCalledTimes(1);
    expect(rest).toHaveBeenCalledWith("GET", "/repos/acme/widgets/pulls/7");
    expect(mockRunIterate).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      action: "cancel",
      reason: "merged",
      state: "MERGED",
      status: "MERGED",
      pr: 7,
      repo: "acme/widgets",
      shouldCancel: true,
      baseBranch: "main",
      mergeStateStatus: "CLEAN",
      log: "CANCEL: PR #7 is merged — stopping",
    });
    const text = formatIterateResult(result);
    const json = projectIterateLean(result) as { instructions?: string[] };
    expect(text).toContain("# PR #7 [CANCEL] — merged");
    expect(text).toContain("Stop — the PR loop is complete.");
    expect(json).toMatchObject({
      action: "cancel",
      reason: "merged",
      state: "MERGED",
      repo: "acme/widgets",
    });
    expect(json.instructions?.join("\n")).toContain("Stop — the PR loop is complete.");
  });

  it("does not probe while REST core is exhausted", async () => {
    const resetAt = Math.floor(Date.now() / 1000) + 180;
    const full = exhaustedPrimaryLimitDelayMs(resetAt, Date.now());
    vi.mocked(rest).mockResolvedValue(mergedPull());
    mockRunIterate
      .mockRejectedValueOnce(exhausted(resetAt, "core"))
      .mockResolvedValueOnce(makeCancelResult());
    const pending = runPoll(opts);
    await vi.advanceTimersByTimeAsync(full);
    await expect(pending).resolves.toMatchObject({ action: "cancel" });
    expect(rest).not.toHaveBeenCalled();
    expect(mockRunIterate).toHaveBeenCalledTimes(2);
  });

  it("skips later probes when the REST pull hits the core limit", async () => {
    const resetAt = Math.floor(Date.now() / 1000) + 180;
    const full = exhaustedPrimaryLimitDelayMs(resetAt, Date.now());
    vi.mocked(rest).mockRejectedValue(
      new GitHubRequestError("API rate limit exceeded for user ID 4242", {
        status: 403,
        rateLimit: { resource: "core", remaining: 0, limit: 5000, resetAt },
      }),
    );
    mockRunIterate
      .mockRejectedValueOnce(exhausted(resetAt))
      .mockResolvedValueOnce(makeCancelResult());
    const pending = runPoll(opts);
    await vi.advanceTimersByTimeAsync(full);
    await expect(pending).resolves.toMatchObject({ action: "cancel" });
    expect(rest).toHaveBeenCalledTimes(1);
  });

  it("keeps sleeping when a REST probe fails", async () => {
    const resetAt = Math.floor(Date.now() / 1000) + 180;
    const full = exhaustedPrimaryLimitDelayMs(resetAt, Date.now());
    vi.mocked(rest).mockRejectedValue(new Error("widgets probe failed"));
    mockRunIterate
      .mockRejectedValueOnce(exhausted(resetAt))
      .mockResolvedValueOnce(makeCancelResult());
    const pending = runPoll(opts);
    await vi.advanceTimersByTimeAsync(full);
    await expect(pending).resolves.toMatchObject({ action: "cancel" });
    expect(rest).toHaveBeenCalledTimes(1);
  });
});
