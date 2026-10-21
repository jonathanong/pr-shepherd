import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("./commands/poll-summary.mts", () => ({
  runAggregatePoll: vi.fn(),
  runPollSummary: vi.fn(),
}));
vi.mock("./commands/iterate/index.mts", () => ({ runIterate: vi.fn() }));
vi.mock("./github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "owner", name: "repo" }),
}));

import { main } from "./cli-parser.mts";
import { runAggregatePoll, runPollSummary } from "./commands/poll-summary.mts";
import { runIterate } from "./commands/iterate/index.mts";
import { makeIterateResult } from "../fixtures/cli-parser.iterate-fixtures.mts";

const mockRunAggregatePoll = vi.mocked(runAggregatePoll);
const mockRunIterate = vi.mocked(runIterate);
const mockRunPollSummary = vi.mocked(runPollSummary);
const aggregateResult = {
  mode: "summary" as const,
  repo: "owner/repo",
  selection: { kind: "prs" as const, requested: [42, 43] },
  reason: "actionable" as const,
  prs: [],
};

beforeEach(() => {
  vi.clearAllMocks();
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
  await main(["node", "shepherd", "42", "43"]);
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
  await main(["node", "shepherd", "stack", "43"]);
  expect(mockRunAggregatePoll).toHaveBeenLastCalledWith(
    expect.objectContaining({
      stackPrNumber: 43,
      targetRepository: { owner: "owner", name: "repo" },
    }),
  );
});

it("routes duplicate PR arguments through the authoritative single-PR iterator", async () => {
  mockRunIterate.mockResolvedValue(makeIterateResult("cancel"));
  await main(["node", "shepherd", "42", "42"]);
  expect(mockRunIterate).toHaveBeenCalledWith(expect.objectContaining({ prNumber: 42 }));
  expect(mockRunAggregatePoll).not.toHaveBeenCalled();
});

it("runs one aggregate tick for several iterate PRs", async () => {
  mockRunPollSummary.mockResolvedValue(aggregateResult);
  await main(["node", "shepherd", "iterate", "42", "43", "--format=json"]);
  expect(mockRunPollSummary).toHaveBeenCalledWith(
    expect.objectContaining({ prNumbers: [42, 43], format: "json" }),
  );
  expect(mockRunAggregatePoll).not.toHaveBeenCalled();
  expect(process.exitCode).toBe(0);
});

it.each([
  [["stack", "43", "extra"], 'unexpected argument: "extra"'],
  [["stack", "42", "43"], "stack requires exactly one PR reference."],
])("rejects %j with a stack usage error", async (args, message) => {
  await main(["node", "shepherd", ...args]);
  expect(vi.mocked(process.stderr.write)).toHaveBeenCalledWith(
    expect.stringContaining(`pr-shepherd: stack: ${message}`),
  );
  expect(process.exitCode).toBe(64);
  expect(mockRunAggregatePoll).not.toHaveBeenCalled();
});
