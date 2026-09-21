/* eslint-disable max-lines */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../github/poll-summary.mts", () => ({ fetchPollSummary: vi.fn() }));
vi.mock("../github/client.mts", () => ({ getRepoInfo: vi.fn() }));
vi.mock("../github/api-telemetry.mts", () => ({
  withApiTelemetryScope: vi.fn((callback: () => unknown) => callback()),
  summarizeApiTelemetry: vi.fn(() => undefined),
}));
vi.mock("../util/sleep.mts", () => ({ sleep: vi.fn() }));

import { fetchPollSummary } from "../github/poll-summary.mts";
import { getRepoInfo } from "../github/client.mts";
import { GitHubRequestError } from "../github/errors.mts";
import { sleep } from "../util/sleep.mts";
import { EXIT, ShepherdError } from "../exit-codes.mts";
import type { PollSummaryItem } from "../types.mts";
import { runAggregatePoll, runPollSummary } from "./poll-summary.mts";

const mockFetch = vi.mocked(fetchPollSummary);
const mockGetRepoInfo = vi.mocked(getRepoInfo);
const mockSleep = vi.mocked(sleep);

function row(pr: number, action: PollSummaryItem["action"]): PollSummaryItem {
  return {
    pr,
    repo: "acme/widgets",
    title: `PR ${pr}`,
    url: `https://github.com/acme/widgets/pull/${pr}`,
    action,
    reasons: [action],
    state: action === "cancel" ? "MERGED" : "OPEN",
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: null,
    headRefName: `feature-${pr}`,
    headRefOid: String(pr).padStart(40, "0"),
    baseRefName: "main",
    checks: { passing: 1, failing: 0, inProgress: 0, skipped: 0, filtered: 0 },
    review: { comments: 0, reviews: 0, threads: 0, actionable: 0 },
    pollCommand: `npx pr-shepherd https://github.com/acme/widgets/pull/${pr} --until-terminal`,
  };
}

function queuedStackRow(pr: number): PollSummaryItem {
  return {
    ...row(pr, "wait"),
    readyReceipt: true,
    isInMergeQueue: true,
    stack: { number: 1, size: 2, position: pr - 41, baseRefName: "main" },
  };
}

const opts = {
  prNumbers: [42, 43],
  targetRepository: { owner: "acme", name: "widgets" },
  intervalSeconds: 60,
  timeoutSeconds: 0,
  debounceSeconds: 0,
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("aggregate poll recurrence", () => {
  it("uses waiting for a one-shot API summary with no actionable rows", async () => {
    mockFetch.mockResolvedValue({
      selection: { kind: "prs", requested: [42, 43] },
      prs: [row(42, "wait"), row(43, "cancel")],
    });

    await expect(runPollSummary(opts)).resolves.toMatchObject({ reason: "waiting" });
  });

  it("resolves the checkout repository when the caller does not supply one", async () => {
    mockGetRepoInfo.mockResolvedValue({ owner: "acme", name: "widgets" });
    mockFetch.mockResolvedValue({
      selection: { kind: "prs", requested: [42] },
      prs: [row(42, "cancel")],
    });
    await expect(runPollSummary({ prNumbers: [42] })).resolves.toMatchObject({
      reason: "all_terminal",
    });
  });

  it("returns actionable as soon as any row needs work", async () => {
    mockFetch.mockResolvedValue({
      selection: { kind: "prs", requested: [42, 43] },
      prs: [row(42, "wait"), row(43, "fix_code")],
    });

    await expect(runAggregatePoll(opts)).resolves.toMatchObject({ reason: "actionable" });
  });

  it("returns stack SHEPHERD immediately when debounce is disabled", async () => {
    mockFetch.mockResolvedValue({
      selection: { kind: "stack", anchor: 43, stackNumber: 1, stackSize: 2 },
      prs: [
        { ...row(42, "fix_code"), stack: { number: 1, size: 2, position: 1, baseRefName: "main" } },
        { ...row(43, "fix_code"), stack: { number: 1, size: 2, position: 2, baseRefName: "main" } },
      ],
    });

    await expect(
      runAggregatePoll({
        ...opts,
        prNumbers: [],
        stackPrNumber: 43,
        debounceSeconds: 0,
        untilTerminal: true,
      }),
    ).resolves.toMatchObject({ reason: "actionable", nextAction: "shepherd" });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("debounces stack SHEPHERD until the configured window elapses", async () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    mockSleep.mockImplementation(async (milliseconds) => {
      now += milliseconds;
    });
    mockFetch.mockResolvedValue({
      selection: { kind: "stack", anchor: 43, stackNumber: 1, stackSize: 2 },
      prs: [
        { ...row(42, "fix_code"), stack: { number: 1, size: 2, position: 1, baseRefName: "main" } },
        { ...row(43, "fix_code"), stack: { number: 1, size: 2, position: 2, baseRefName: "main" } },
      ],
    });

    await expect(
      runAggregatePoll({
        ...opts,
        prNumbers: [],
        stackPrNumber: 43,
        debounceSeconds: 60,
        untilTerminal: true,
      }),
    ).resolves.toMatchObject({ reason: "actionable", nextAction: "shepherd" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockSleep).toHaveBeenCalledWith(60_000);
  });

  it("returns immediate mark-ready work without debouncing", async () => {
    mockFetch.mockResolvedValue({
      selection: { kind: "prs", requested: [42] },
      prs: [row(42, "mark_ready")],
    });
    await expect(runAggregatePoll(opts)).resolves.toMatchObject({ reason: "actionable" });
  });

  it("waits through the configured fix debounce", async () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    mockSleep.mockImplementation(async (milliseconds) => {
      now += milliseconds;
    });
    mockFetch.mockResolvedValue({
      selection: { kind: "prs", requested: [42] },
      prs: [row(42, "fix_code")],
    });
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await expect(
      runAggregatePoll({ ...opts, timeoutSeconds: 120, debounceSeconds: 60, quietStatus: true }),
    ).resolves.toMatchObject({ reason: "actionable" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(stderr).toHaveBeenCalledTimes(1);
  });

  it("does not let timeout cut an active fix debounce short", async () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    mockSleep.mockImplementation(async (milliseconds) => {
      now += milliseconds;
    });
    mockFetch.mockResolvedValue({
      selection: { kind: "prs", requested: [42] },
      prs: [row(42, "fix_code")],
    });

    await expect(
      runAggregatePoll({ ...opts, timeoutSeconds: 1, debounceSeconds: 60 }),
    ).resolves.toMatchObject({ reason: "actionable" });
    expect(mockSleep).toHaveBeenCalledWith(60_000);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("prints changed waiting snapshots but suppresses unchanged quiet ticks", async () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    mockSleep.mockImplementation(async (milliseconds) => {
      now += milliseconds;
    });
    const changed = { ...row(42, "wait"), checks: { inProgress: 1 } };
    mockFetch
      .mockResolvedValueOnce({
        selection: { kind: "prs", requested: [42] },
        prs: [row(42, "wait")],
      })
      .mockResolvedValue({
        selection: { kind: "prs", requested: [42] },
        prs: [changed],
      });
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await runAggregatePoll({ ...opts, timeoutSeconds: 180, quietStatus: true });
    expect(stderr).toHaveBeenCalledTimes(2);
  });

  it("retries one GraphQL throttle during an until-terminal run", async () => {
    mockFetch
      .mockRejectedValueOnce(
        new GitHubRequestError("throttled", { status: 429, retryAfterSeconds: 1 }),
      )
      .mockResolvedValueOnce({
        selection: { kind: "prs", requested: [42] },
        prs: [row(42, "cancel")],
      });
    await expect(runAggregatePoll({ ...opts, untilTerminal: true })).resolves.toMatchObject({
      reason: "all_terminal",
    });
    expect(mockSleep).toHaveBeenCalledWith(1_000);
  });

  it("keeps completed rows alongside waiting rows until timeout", async () => {
    mockFetch.mockResolvedValue({
      selection: { kind: "prs", requested: [42, 43] },
      prs: [row(42, "cancel"), row(43, "wait")],
    });

    await expect(runAggregatePoll(opts)).resolves.toMatchObject({ reason: "timeout" });
  });

  it("accepts a disappeared stack only after its known members verify terminal", async () => {
    mockFetch
      .mockResolvedValueOnce({
        selection: { kind: "stack", anchor: 43, stackNumber: 1, stackSize: 2 },
        prs: [queuedStackRow(42), queuedStackRow(43)],
      })
      .mockRejectedValueOnce(
        new ShepherdError("PR #43 is not part of a native GitHub stack", EXIT.UNAVAILABLE),
      )
      .mockResolvedValueOnce({
        selection: { kind: "prs", requested: [42, 43] },
        prs: [row(42, "cancel"), row(43, "cancel")],
      });

    await expect(
      runAggregatePoll({
        ...opts,
        prNumbers: [],
        stackPrNumber: 43,
        merge: true,
        timeoutSeconds: 60,
        untilTerminal: true,
      }),
    ).resolves.toMatchObject({ reason: "all_terminal" });
  });

  it("escalates a disappeared stack when any tracked layer has not merged", async () => {
    mockFetch
      .mockResolvedValueOnce({
        selection: { kind: "stack", anchor: 43, stackNumber: 1, stackSize: 2 },
        prs: [queuedStackRow(42), queuedStackRow(43)],
      })
      .mockRejectedValueOnce(
        new ShepherdError("PR #43 is not part of a native GitHub stack", EXIT.UNAVAILABLE),
      )
      .mockResolvedValueOnce({
        selection: { kind: "prs", requested: [42, 43] },
        prs: [row(42, "cancel"), { ...row(43, "cancel"), state: "CLOSED" }],
      });

    const result = await runAggregatePoll({
      ...opts,
      prNumbers: [],
      stackPrNumber: 43,
      merge: true,
      timeoutSeconds: 60,
      untilTerminal: true,
    });
    expect(result.prs.map((item) => item.state)).toEqual(["MERGED", "CLOSED"]);
    expect(result).toMatchObject({
      reason: "actionable",
      nextAction: "escalate",
      stackMergeable: false,
      selection: { kind: "stack" },
    });
  });

  it("preserves disappeared-stack escalation when the fallback has an open orphan", async () => {
    mockFetch
      .mockResolvedValueOnce({
        selection: { kind: "stack", anchor: 43, stackNumber: 1, stackSize: 2 },
        prs: [queuedStackRow(42), queuedStackRow(43)],
      })
      .mockRejectedValueOnce(
        new ShepherdError("PR #43 is not part of a native GitHub stack", EXIT.UNAVAILABLE),
      )
      .mockResolvedValueOnce({
        selection: { kind: "prs", requested: [42, 43] },
        prs: [{ ...row(42, "wait"), state: "OPEN" }, row(43, "cancel")],
      });

    const result = await runAggregatePoll({
      ...opts,
      prNumbers: [],
      stackPrNumber: 43,
      merge: true,
      timeoutSeconds: 60,
      untilTerminal: true,
    });
    expect(result).toMatchObject({
      reason: "actionable",
      nextAction: "escalate",
      stackMergeable: false,
      selection: { kind: "stack" },
    });
    expect(result.prs[0]?.state).toBe("OPEN");
    expect(result.instructions?.[0]).toContain("disappeared");
  });
});
