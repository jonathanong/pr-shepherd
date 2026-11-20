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
import { WatchedError, type WatchSet } from "../state/watch-set.mts";
import { runAggregatePoll } from "./poll-summary.mts";
import { row } from "../../test-helpers/commands/poll-summary-stack.test-support.mts";

const mockFetch = vi.mocked(fetchPollSummary);
const repo = { owner: "acme", name: "widgets" };
const opts = {
  prNumbers: [42, 43],
  targetRepository: repo,
  intervalSeconds: 60,
  timeoutSeconds: 0,
  debounceSeconds: 0,
};

const summary = (actions: Array<"wait" | "cancel">) => ({
  selection: { kind: "prs" as const, requested: [42, 43] },
  prs: actions.map((action, index) =>
    row(42 + index, 42 + index, { action, state: action === "cancel" ? "MERGED" : "OPEN" }),
  ),
});

function fakeWatch(sync: WatchSet["sync"]): WatchSet {
  return { repo, claim: () => [], sync, releaseAll: () => {} };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("aggregate poll with per-PR watcher locks", () => {
  it("syncs the locks with each tick's rows, so a PR that went terminal is released mid-run", async () => {
    const sync = vi.fn();
    mockFetch
      .mockResolvedValueOnce(summary(["wait", "cancel"]) as never)
      .mockResolvedValue(summary(["cancel", "cancel"]) as never);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const result = await runAggregatePoll({
      ...opts,
      timeoutSeconds: 3600,
      watch: fakeWatch(sync),
    });

    expect(result.reason).toBe("all_terminal");
    expect(sync).toHaveBeenCalledTimes(2);
    expect(
      sync.mock.calls[0]![0].map((item: { pr: number; action: string }) => [item.pr, item.action]),
    ).toEqual([
      [42, "wait"],
      [43, "cancel"],
    ]);
  });

  it("propagates the WatchedError a sync raises", async () => {
    const error = new WatchedError(repo, [{ pr: 43, pid: 5, flags: [] }]);
    mockFetch.mockResolvedValue(summary(["wait", "wait"]) as never);
    const watch = fakeWatch(() => {
      throw error;
    });
    await expect(runAggregatePoll({ ...opts, watch })).rejects.toBe(error);
  });

  it("polls without any lock when no watch is supplied", async () => {
    mockFetch.mockResolvedValue(summary(["cancel", "cancel"]) as never);
    await expect(runAggregatePoll(opts)).resolves.toMatchObject({ reason: "all_terminal" });
  });
});
