import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../github/poll-summary.mts", () => ({ fetchPollSummary: vi.fn() }));
vi.mock("../github/client.mts", () => ({ getRepoInfo: vi.fn() }));
vi.mock("../github/api-telemetry.mts", () => ({
  withApiTelemetryScope: vi.fn((callback: () => unknown) => callback()),
  summarizeApiTelemetry: vi.fn(() => undefined),
}));
vi.mock("../util/sleep.mts", () => ({ sleep: vi.fn() }));

import { fetchPollSummary } from "../github/poll-summary.mts";
import { EXIT, ShepherdError } from "../exit-codes.mts";
import type { PollSummaryItem } from "../types.mts";
import { runAggregatePoll, runPollSummary } from "./poll-summary.mts";

const mockFetch = vi.mocked(fetchPollSummary);

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

const opts = {
  prNumbers: [42, 43],
  targetRepository: { owner: "acme", name: "widgets" },
  intervalSeconds: 60,
  timeoutSeconds: 0,
  debounceSeconds: 0,
};

beforeEach(() => vi.clearAllMocks());

describe("aggregate poll recurrence", () => {
  it("uses waiting for a one-shot API summary with no actionable rows", async () => {
    mockFetch.mockResolvedValue({
      selection: { kind: "prs", requested: [42, 43] },
      prs: [row(42, "wait"), row(43, "cancel")],
    });

    await expect(runPollSummary(opts)).resolves.toMatchObject({ reason: "waiting" });
  });

  it("returns actionable as soon as any row needs work", async () => {
    mockFetch.mockResolvedValue({
      selection: { kind: "prs", requested: [42, 43] },
      prs: [row(42, "wait"), row(43, "fix_code")],
    });

    await expect(runAggregatePoll(opts)).resolves.toMatchObject({ reason: "actionable" });
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
        prs: [row(42, "wait"), row(43, "wait")],
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
        timeoutSeconds: 60,
        untilTerminal: true,
      }),
    ).resolves.toMatchObject({ reason: "all_terminal" });
  });
});
