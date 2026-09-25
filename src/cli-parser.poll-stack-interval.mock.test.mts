import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pollConfig } = vi.hoisted(() => ({
  pollConfig: {
    intervalSeconds: 30,
    stackIntervalFactor: 4,
    timeoutSeconds: 90,
    debounceSeconds: 0,
    quietStatus: false,
  },
}));

vi.mock("./commands/iterate/index.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./commands/iterate/index.mts")>();
  return { ...actual, runIterate: vi.fn() };
});
vi.mock("./commands/check.mts", () => ({ runCheck: vi.fn() }));
vi.mock("./commands/resolve.mts", () => ({ runResolveMutate: vi.fn() }));
vi.mock("./commands/commit-suggestion.mts", () => ({ runCommitSuggestion: vi.fn() }));
vi.mock("./commands/poll-summary.mts", () => ({ runAggregatePoll: vi.fn() }));
vi.mock("./github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "acme", name: "widgets" }),
}));
vi.mock("./config/load.mts", () => ({
  loadConfig: () => ({
    poll: pollConfig,
    watch: { readyDelayMinutes: 10, graphqlQuotaWarnings: [] },
    iterate: { stallTimeoutMinutes: 60 },
  }),
}));

import { main } from "./cli-parser.mts";
import { runAggregatePoll } from "./commands/poll-summary.mts";
import { runIterate } from "./commands/iterate/index.mts";
import { makeIterateResult } from "../fixtures/cli-parser.iterate-fixtures.mts";

const mockRunAggregatePoll = vi.mocked(runAggregatePoll);
const mockRunIterate = vi.mocked(runIterate);
const aggregateResult = {
  mode: "summary" as const,
  repo: "acme/widgets",
  selection: { kind: "stack" as const, anchor: 43, stackNumber: 1, stackSize: 2 },
  reason: "waiting" as const,
  prs: [],
};

function stderrText(): string {
  return vi
    .mocked(process.stderr.write)
    .mock.calls.map((call: unknown[]) => String(call[0]))
    .join("");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  process.exitCode = undefined;
  Object.assign(pollConfig, {
    intervalSeconds: 30,
    stackIntervalFactor: 4,
    timeoutSeconds: 90,
    debounceSeconds: 0,
    quietStatus: false,
  });
  mockRunAggregatePoll.mockResolvedValue(aggregateResult);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  process.exitCode = undefined;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("poll interval periods", () => {
  it("sleeps intervalSeconds for one PR even when the stack factor is larger", async () => {
    mockRunIterate
      .mockResolvedValueOnce(makeIterateResult("wait"))
      .mockResolvedValue(makeIterateResult("cancel"));

    const promise = main(["node", "shepherd", "poll", "42"]);
    await vi.waitFor(() => expect(mockRunIterate).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(30_000);
    await promise;

    expect(mockRunIterate).toHaveBeenCalledTimes(2);
    expect(stderrText()).toContain("next tick in 30s");
    expect(mockRunAggregatePoll).not.toHaveBeenCalled();
  });

  it("sleeps intervalSeconds times the factor for a stack without --interval", async () => {
    await main(["node", "shepherd", "poll", "--stack", "43"]);

    expect(mockRunAggregatePoll).toHaveBeenCalledWith(
      expect.objectContaining({
        stackPrNumber: 43,
        targetRepository: { owner: "acme", name: "widgets" },
        intervalSeconds: 120,
      }),
    );
  });

  it("sleeps the same scaled interval for an explicit multi-PR poll", async () => {
    await main(["node", "shepherd", "poll", "42", "43"]);

    expect(mockRunAggregatePoll).toHaveBeenCalledWith(
      expect.objectContaining({ prNumbers: [42, 43], intervalSeconds: 120 }),
    );
  });

  it("does not multiply an explicit --interval on a stack", async () => {
    await main(["node", "shepherd", "poll", "--stack", "43", "--interval", "15"]);

    expect(mockRunAggregatePoll).toHaveBeenCalledWith(
      expect.objectContaining({ stackPrNumber: 43, intervalSeconds: 15 }),
    );
  });

  it("keeps a fractional stack product instead of rounding it to zero", async () => {
    Object.assign(pollConfig, { intervalSeconds: 0.2, stackIntervalFactor: 2 });

    await main(["node", "shepherd", "poll", "--stack", "43"]);

    expect(mockRunAggregatePoll).toHaveBeenCalledWith(
      expect.objectContaining({ intervalSeconds: 0.4 }),
    );
  });
});
