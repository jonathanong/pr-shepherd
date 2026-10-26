import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../github/poll-summary.mts", () => ({ fetchPollSummary: vi.fn() }));
vi.mock("../github/client.mts", () => ({ getRepoInfo: vi.fn() }));
vi.mock("../github/api-telemetry.mts", () => ({
  withApiTelemetryScope: vi.fn((callback: () => unknown) => callback()),
  summarizeApiTelemetry: vi.fn(() => undefined),
  withGraphqlCredentialFingerprint: <T,>(sample: T) => sample,
  withRestCoreCredentialFingerprint: <T,>(sample: T) => sample,
}));
vi.mock("../util/sleep.mts", () => ({ sleep: vi.fn() }));

import { fetchPollSummary } from "../github/poll-summary.mts";
import { sleep } from "../util/sleep.mts";
import type { PollSummaryItem } from "../types.mts";
import { runAggregatePoll } from "./poll-summary.mts";

const mockFetch = vi.mocked(fetchPollSummary);
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

const numbers = Array.from({ length: 20 }, (_, index) => 101 + index);
const opts = {
  prNumbers: numbers,
  targetRepository: { owner: "acme", name: "widgets" },
  intervalSeconds: 60,
  timeoutSeconds: 0,
  debounceSeconds: 0,
};

function selection(rows: PollSummaryItem[]) {
  return { selection: { kind: "prs" as const, requested: numbers }, prs: rows };
}

/** Twenty rows in request order; `overrides` replaces the action at a zero-based index. */
function twenty(
  fill: PollSummaryItem["action"],
  overrides: Record<number, PollSummaryItem["action"]>,
) {
  return numbers.map((pr, index) => row(pr, overrides[index] ?? fill));
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("aggregate poll with twenty rows", () => {
  it("holds 19 WAIT + 1 TRIAGE for the debounce, then returns all 20 rows", async () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    mockSleep.mockImplementation(async (milliseconds) => {
      now += milliseconds;
    });
    mockFetch.mockResolvedValue(selection(twenty("wait", { 12: "triage" })));
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const result = await runAggregatePoll({ ...opts, timeoutSeconds: 600, debounceSeconds: 60 });

    expect(result.reason).toBe("actionable");
    expect(result.prs.map((item) => item.pr)).toEqual(numbers);
    expect(result.prs.filter((item) => item.action === "triage").map((item) => item.pr)).toEqual([
      113,
    ]);
    expect(mockSleep).toHaveBeenCalledTimes(1);
    expect(mockSleep).toHaveBeenCalledWith(60_000);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("returns immediately when one ESCALATE sits among WAIT rows", async () => {
    mockFetch.mockResolvedValue(selection(twenty("wait", { 5: "escalate" })));

    const result = await runAggregatePoll({ ...opts, debounceSeconds: 60 });

    expect(result.reason).toBe("actionable");
    expect(result.prs).toHaveLength(20);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockSleep).not.toHaveBeenCalled();
  });

  it("tells the caller to stop after reporting handoffs when only CANCEL and one ESCALATE remain", async () => {
    mockFetch.mockResolvedValue(selection(twenty("cancel", { 19: "escalate" })));

    const result = await runAggregatePoll({ ...opts, debounceSeconds: 60 });

    expect(result.reason).toBe("actionable");
    expect(result.prs).toHaveLength(20);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.instructions).toContain(
      "3. Stop after reporting each `ESCALATE` handoff; every selected row is `CANCEL` or `ESCALATE`, so do not run this aggregate poll again.",
    );
  });
});
