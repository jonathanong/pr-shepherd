import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("./commands/poll-summary.mts", () => ({ runAggregatePoll: vi.fn() }));
vi.mock("./github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "owner", name: "repo" }),
}));

import { main } from "./cli-parser.mts";
import { runAggregatePoll } from "./commands/poll-summary.mts";

const mockRunAggregatePoll = vi.mocked(runAggregatePoll);
const aggregateResult = {
  mode: "summary" as const,
  repo: "owner/repo",
  selection: { kind: "prs" as const, requested: [42, 43] },
  reason: "actionable" as const,
  prs: [],
};

beforeEach(() => {
  process.exitCode = undefined;
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  process.exitCode = undefined;
  vi.restoreAllMocks();
});

it("routes explicit PR sets and native stacks to aggregate polling", async () => {
  mockRunAggregatePoll.mockResolvedValue(aggregateResult);
  await main(["node", "shepherd", "poll", "42", "43"]);
  expect(mockRunAggregatePoll).toHaveBeenLastCalledWith(
    expect.objectContaining({
      prNumbers: [42, 43],
      targetRepository: { owner: "owner", name: "repo" },
    }),
  );

  mockRunAggregatePoll.mockResolvedValue({
    ...aggregateResult,
    selection: { kind: "stack", anchor: 43, stackNumber: 1, stackSize: 0 },
  });
  await main(["node", "shepherd", "poll", "--stack", "43"]);
  expect(mockRunAggregatePoll).toHaveBeenLastCalledWith(
    expect.objectContaining({
      stackPrNumber: 43,
      targetRepository: { owner: "owner", name: "repo" },
    }),
  );
});
