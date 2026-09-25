import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatPollSummaryResult } from "../cli/poll-summary-formatter.mts";
import { GitHubRequestError } from "../github/errors.mts";

vi.mock("../github/poll-summary.mts", () => ({ fetchPollSummary: vi.fn() }));
vi.mock("../github/client.mts", () => ({ getRepoInfo: vi.fn() }));
vi.mock("../github/rest-http.mts", () => ({ rest: vi.fn(), restWithRateLimit: vi.fn() }));
vi.mock("../state/stack-stall.mts", () => ({
  readStackStallState: vi.fn(async () => ({ ok: true, state: null })),
  writeStackStallState: vi.fn(async () => ({ ok: true })),
  clearStackStallState: vi.fn(async () => undefined),
}));

import { fetchPollSummary } from "../github/poll-summary.mts";
import { rest } from "../github/rest-http.mts";
import { exhaustedPrimaryLimitDelayMs } from "./poll-rate-limit-delay.mts";
import { runAggregatePoll } from "./poll-summary.mts";

function exhausted(resetAt: number, resource = "graphql"): GitHubRequestError {
  return new GitHubRequestError("API rate limit exceeded for user ID 4242", {
    status: 403,
    rateLimit: { resource, remaining: 0, limit: 5000, resetAt },
  });
}

function row(pr: number, state: "OPEN" | "MERGED" | "CLOSED") {
  return {
    pr,
    repo: "acme/widgets",
    title: `PR ${pr}`,
    url: `https://github.com/acme/widgets/pull/${pr}`,
    action: state === "OPEN" ? ("wait" as const) : ("cancel" as const),
    reasons: [state === "OPEN" ? "pending-or-unknown" : state.toLowerCase()],
    state,
    mergeable: "MERGEABLE" as const,
    mergeStateStatus: "CLEAN" as const,
    headRefName: `feature-${pr}`,
    headRefOid: String(pr).padStart(40, "0"),
    baseRefName: "main",
  };
}

const opts = {
  prNumbers: [7],
  targetRepository: { owner: "acme", name: "widgets" },
  intervalSeconds: 60,
  timeoutSeconds: 0,
  debounceSeconds: 0,
  untilTerminal: true,
};

describe("aggregate rate-limit sleep probe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns all-terminal CANCEL when a mid-sleep REST pull is merged", async () => {
    const started = Date.now();
    const resetAt = Math.floor(started / 1000) + 180;
    expect(exhaustedPrimaryLimitDelayMs(resetAt, started)).toBeGreaterThan(60_000);
    vi.mocked(rest).mockResolvedValue({
      merged: true,
      state: "closed",
      title: "Add widget export",
      html_url: "https://github.com/acme/widgets/pull/7",
      mergeable: true,
      mergeable_state: "clean",
      base: { ref: "main" },
      head: { ref: "feature-7", sha: "c".repeat(40) },
    });
    vi.mocked(fetchPollSummary).mockRejectedValueOnce(exhausted(resetAt));
    const pending = runAggregatePoll(opts);
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pending;
    expect(Date.now() - started).toBe(60_000);
    expect(rest).toHaveBeenCalledWith("GET", "/repos/acme/widgets/pulls/7");
    expect(fetchPollSummary).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      reason: "all_terminal",
      repo: "acme/widgets",
      instructions: ["1. Stop — every selected PR is terminal."],
    });
    expect(result.prs[0]).toMatchObject({
      pr: 7,
      action: "cancel",
      state: "MERGED",
      reasons: ["merged"],
      title: "Add widget export",
      headRefOid: "c".repeat(40),
      baseRefName: "main",
    });
    const text = formatPollSummaryResult(result);
    expect(text).toContain("# Poll summary [ALL_TERMINAL]");
    expect(text).toContain("## Instructions\n\n1. Stop — every selected PR is terminal.");
    expect(text).toContain("[CANCEL]");
    expect(JSON.stringify(result)).toContain("all_terminal");
  });

  it("keeps sleeping when only some tracked PRs are merged", async () => {
    const resetAt = Math.floor(Date.now() / 1000) + 180;
    const full = exhaustedPrimaryLimitDelayMs(resetAt, Date.now());
    vi.mocked(rest).mockImplementation(async (_method, path) => {
      const merged = String(path).endsWith("/7");
      return { merged, state: merged ? "closed" : "open" };
    });
    vi.mocked(fetchPollSummary)
      .mockRejectedValueOnce(exhausted(resetAt))
      .mockResolvedValueOnce({
        selection: { kind: "prs", requested: [7, 8] },
        prs: [row(7, "MERGED"), row(8, "MERGED")],
      });
    let settled = false;
    const pending = runAggregatePoll({ ...opts, prNumbers: [7, 8] }).then((result) => {
      settled = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(full - 60_000);
    const result = await pending;
    expect(result.reason).toBe("all_terminal");
    expect(fetchPollSummary).toHaveBeenCalledTimes(2);
    expect(vi.mocked(rest).mock.calls.length).toBeGreaterThan(1);
  });

  it("does not probe while REST core is exhausted", async () => {
    const resetAt = Math.floor(Date.now() / 1000) + 180;
    const full = exhaustedPrimaryLimitDelayMs(resetAt, Date.now());
    vi.mocked(rest).mockResolvedValue({ merged: true, state: "closed" });
    vi.mocked(fetchPollSummary)
      .mockRejectedValueOnce(exhausted(resetAt, "core"))
      .mockResolvedValueOnce({
        selection: { kind: "prs", requested: [7] },
        prs: [row(7, "MERGED")],
      });
    const pending = runAggregatePoll(opts);
    await vi.advanceTimersByTimeAsync(full);
    await expect(pending).resolves.toMatchObject({ reason: "all_terminal" });
    expect(rest).not.toHaveBeenCalled();
  });

  it("escalates when every tracked layer closes without merging during the sleep", async () => {
    vi.mocked(rest).mockResolvedValue({ merged: false, state: "closed" });
    vi.mocked(fetchPollSummary)
      .mockResolvedValueOnce({
        selection: { kind: "stack", anchor: 8, stackNumber: 4, stackSize: 2 },
        prs: [
          {
            ...row(7, "OPEN"),
            readyReceipt: true,
            isInMergeQueue: true,
            stack: { number: 4, size: 2, position: 1, baseRefName: "main" },
          },
          {
            ...row(8, "OPEN"),
            readyReceipt: true,
            isInMergeQueue: true,
            stack: { number: 4, size: 2, position: 2, baseRefName: "main" },
          },
        ],
      })
      .mockRejectedValueOnce(exhausted(Math.floor(Date.now() / 1000) + 10_000));
    const pending = runAggregatePoll({
      ...opts,
      prNumbers: [],
      stackPrNumber: 8,
      merge: true,
    });
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pending;
    expect(result.nextAction).toBe("escalate");
    expect(result.stackMergeable).toBe(false);
    expect(result.prs.map((item) => item.state)).toEqual(["CLOSED", "CLOSED"]);
    const text = formatPollSummaryResult(result);
    expect(text).toContain("**next action** `escalate`");
    expect(text).toContain("state `CLOSED`");
    expect(text).not.toContain("every stack layer is merged");
  });
});
