import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("./commands/poll-summary.mts", () => ({
  runAggregatePoll: vi.fn(),
  runPollSummary: vi.fn(),
}));
vi.mock("./commands/iterate/index.mts", () => ({ runIterate: vi.fn() }));
vi.mock("./github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "owner", name: "repo" }),
}));

vi.mock("./commands/stack-targets.mts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./commands/stack-targets.mts")>()),
  resolveStackTarget: vi.fn(),
}));

import { main } from "./cli-parser.mts";
import { resolveStackTarget } from "./commands/stack-targets.mts";
import { EXIT, ShepherdError } from "./exit-codes.mts";
import { runAggregatePoll, runPollSummary } from "./commands/poll-summary.mts";
import { runIterate } from "./commands/iterate/index.mts";
import { makeIterateResult } from "../fixtures/cli-parser.iterate-fixtures.mts";

const mockRunAggregatePoll = vi.mocked(runAggregatePoll);
const mockRunIterate = vi.mocked(runIterate);
const mockRunPollSummary = vi.mocked(runPollSummary);
const mockResolveStackTarget = vi.mocked(resolveStackTarget);
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
  mockResolveStackTarget.mockResolvedValue({
    anchor: 43,
    targetRepository: { owner: "owner", name: "repo" },
  });
  await main(["node", "shepherd", "stack", "43"]);
  expect(mockResolveStackTarget).toHaveBeenLastCalledWith({
    refs: [{ number: 43 }],
  });
  const stackOptions = mockRunAggregatePoll.mock.calls.at(-1)?.[0];
  expect(stackOptions).toMatchObject({
    stackPrNumber: 43,
    merge: false,
    targetRepository: { owner: "owner", name: "repo" },
  });
  expect(stackOptions).not.toHaveProperty("stackOwned");
  expect(stackOptions).not.toHaveProperty("stackMerge");
});

it.each([
  [["--merge"], "merge", { kind: "all" }],
  [["--merge-ready"], "ready", { kind: "ready" }],
  [["--merge-through", "42"], "through", { kind: "through", pr: 42 }],
])("maps the stack merge flag %j to its scope", async (flags, merge, scope) => {
  mockRunAggregatePoll.mockResolvedValue(aggregateResult);
  mockResolveStackTarget.mockResolvedValue({
    anchor: 42,
    owned: [41, 42],
    through: 42,
  });
  await main(["node", "shepherd", "stack", "41", "42", ...flags]);
  expect(mockResolveStackTarget).toHaveBeenLastCalledWith(
    expect.objectContaining({ refs: [{ number: 41 }, { number: 42 }], merge }),
  );
  expect(mockRunAggregatePoll).toHaveBeenLastCalledWith(
    expect.objectContaining({
      stackPrNumber: 42,
      stackOwned: [41, 42],
      merge: true,
      stackMerge: scope,
    }),
  );
});

it("runs one read-only stack tick with --once", async () => {
  mockRunPollSummary.mockResolvedValue(aggregateResult);
  mockResolveStackTarget.mockResolvedValue({ anchor: 43 });
  await main(["node", "shepherd", "stack", "43", "--once"]);
  expect(mockRunPollSummary).toHaveBeenCalledWith(expect.objectContaining({ stackPrNumber: 43 }));
  expect(mockRunAggregatePoll).not.toHaveBeenCalled();
});

it("lets a stack resolution error reach the entrypoint with its usage exit code", async () => {
  mockResolveStackTarget.mockRejectedValue(
    new ShepherdError("These refs span 2 stacks. Run one command per stack:", EXIT.USAGE),
  );
  await expect(main(["node", "shepherd", "stack", "41", "50"])).rejects.toMatchObject({
    message: "These refs span 2 stacks. Run one command per stack:",
    exitCode: EXIT.USAGE,
  });
  expect(mockRunAggregatePoll).not.toHaveBeenCalled();
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
  [["stack"], "stack requires a PR or stack reference."],
  [
    ["stack", "42", "--merge", "--merge-ready"],
    "--merge, --merge-ready, and --merge-through are mutually exclusive.",
  ],
  [["stack", "42", "--merge-through", "bad"], "--merge-through requires a PR reference."],
])("rejects %j with a stack usage error", async (args, message) => {
  await main(["node", "shepherd", ...args]);
  expect(vi.mocked(process.stderr.write)).toHaveBeenCalledWith(
    expect.stringContaining(`pr-shepherd: stack: ${message}`),
  );
  expect(process.exitCode).toBe(64);
  expect(mockRunAggregatePoll).not.toHaveBeenCalled();
});
