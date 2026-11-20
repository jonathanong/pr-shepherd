import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./log/setup.mts", () => ({ setupLog: vi.fn() }));
vi.mock("./commands/poll-summary.mts", () => ({
  runAggregatePoll: vi.fn(),
  runPollSummary: vi.fn(),
}));
vi.mock("./commands/iterate/index.mts", () => ({ runIterate: vi.fn() }));
vi.mock("./github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "owner", name: "repo" }),
  getCurrentPrNumber: vi.fn().mockResolvedValue(42),
}));
vi.mock("./commands/stack-targets.mts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./commands/stack-targets.mts")>()),
  resolveStackTarget: vi.fn().mockResolvedValue({
    anchor: 43,
    targetRepository: { owner: "owner", name: "repo" },
  }),
}));

import { main } from "./cli-parser.mts";
import { runAggregatePoll, runPollSummary } from "./commands/poll-summary.mts";
import { runIterate } from "./commands/iterate/index.mts";
import { EXIT } from "./exit-codes.mts";
import { writeFileSync } from "node:fs";
import { resolvePrStatePath } from "./state/base.mts";
import { acquireWatchLock, releaseAllWatchLocks } from "./state/watch-lock.mts";
import { WatchedError } from "./state/watch-set.mts";
import { makeIterateResult } from "../fixtures/cli-parser.iterate-fixtures.mts";

const mockAggregate = vi.mocked(runAggregatePoll);
const mockSummary = vi.mocked(runPollSummary);
const mockIterate = vi.mocked(runIterate);
const aggregateResult = {
  mode: "summary" as const,
  repo: "owner/repo",
  selection: { kind: "prs" as const, requested: [42, 43] },
  reason: "actionable" as const,
  prs: [],
};
let seq = 0;
let repo: { owner: string; name: string };
let out: string[];
let err: string[];

beforeEach(async () => {
  vi.clearAllMocks();
  seq += 1;
  repo = { owner: "owner", name: `repo-${seq}` };
  const { getRepoInfo } = await import("./github/client.mts");
  vi.mocked(getRepoInfo).mockResolvedValue(repo);
  out = [];
  err = [];
  process.exitCode = undefined;
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => out.push(String(chunk)) > 0);
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => err.push(String(chunk)) > 0);
});
afterEach(() => {
  process.exitCode = undefined;
  releaseAllWatchLocks();
  vi.restoreAllMocks();
});

/** A holder in this process stands in for another live watcher. */
const holdAsOther = (pr: number, flags: string[] = ["--until-terminal"]) =>
  acquireWatchLock(repo, pr, flags);

describe("single PR", () => {
  it("refuses a PR another watcher holds: no poll, instructions, exit 17", async () => {
    holdAsOther(42, ["--until-terminal"]);
    await main(["node", "shepherd", "42", "--until-terminal"]);
    expect(mockIterate).not.toHaveBeenCalled();
    expect(out.join("")).toContain("## Instructions");
    expect(out.join("")).toContain(`PR #42 is already watched by PID ${process.pid}`);
    expect(process.exitCode).toBe(EXIT.WATCHED);
  });

  it("prints the same report as JSON with --format=json", async () => {
    holdAsOther(42, ["--merge"]);
    await main(["node", "shepherd", "42", "--format=json"]);
    const parsed = JSON.parse(out.join(""));
    expect(parsed.alreadyWatched).toEqual([{ pr: 42, pid: process.pid, flags: ["--merge"] }]);
    expect(parsed.instructions[0]).toContain("PR #42 is already watched");
    expect(process.exitCode).toBe(EXIT.WATCHED);
  });

  it("polls a free PR with the lock held, then releases it", async () => {
    mockIterate.mockImplementation(async () => {
      expect(acquireWatchLock(repo, 42, []).acquired).toBe(false);
      return makeIterateResult("cancel");
    });
    await main(["node", "shepherd", "42", "--until-terminal", "--merge"]);
    expect(process.exitCode).toBe(EXIT.OK);
    expect(acquireWatchLock(repo, 42, []).acquired).toBe(true);
  });

  it("locks the branch's PR when no PR is named", async () => {
    holdAsOther(42);
    await main(["node", "shepherd"]);
    expect(mockIterate).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(EXIT.WATCHED);
  });

  it("stops with exit 17 when another live watcher takes the lock between ticks", async () => {
    vi.useFakeTimers();
    vi.spyOn(process, "kill").mockImplementation((() => true) as never);
    mockIterate.mockImplementation(async () => {
      const file = resolvePrStatePath(
        { owner: repo.owner, repo: repo.name, pr: 42 },
        "watch.lock.json",
      );
      writeFileSync(file, JSON.stringify({ pr: 42, pid: 424242, flags: ["--merge"] }));
      return makeIterateResult("wait");
    });
    const run = main(["node", "shepherd", "42", "--interval", "30s", "--timeout", "300s"]);
    await vi.advanceTimersByTimeAsync(30_000);
    await run;
    vi.useRealTimers();
    expect(mockIterate).toHaveBeenCalledTimes(1);
    expect(out.join("")).toContain("PR #42 is already watched by PID 424242 (flags: --merge)");
    expect(process.exitCode).toBe(EXIT.WATCHED);
  });

  it("releases the lock when the poll throws", async () => {
    mockIterate.mockRejectedValue(new Error("boom"));
    await expect(main(["node", "shepherd", "42"])).rejects.toThrow("boom");
    expect(acquireWatchLock(repo, 42, []).acquired).toBe(true);
  });
});

describe("several PRs", () => {
  it("watches only the PRs no one else holds and says which are held", async () => {
    mockAggregate.mockResolvedValue(aggregateResult);
    holdAsOther(42);
    await main(["node", "shepherd", "42", "43"]);
    expect(mockAggregate).toHaveBeenCalledWith(
      expect.objectContaining({ prNumbers: [43], watch: expect.anything() }),
    );
    expect(err.join("")).toContain("PR #42 is already watched");
  });

  it("exits without polling when every PR is held", async () => {
    holdAsOther(42);
    holdAsOther(43);
    await main(["node", "shepherd", "42", "43"]);
    expect(mockAggregate).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(EXIT.WATCHED);
    expect(out.join("")).toContain("PR #43 is already watched");
  });
});

describe("stack", () => {
  it("polls under growing locks and reports a held member with exit 17", async () => {
    mockAggregate.mockImplementation(async (options) => {
      expect(options.watch).toBeDefined();
      throw new WatchedError(repo, [{ pr: 44, pid: 99, flags: ["--merge"] }]);
    });
    await main(["node", "shepherd", "stack", "43"]);
    expect(out.join("")).toContain("PR #44 is already watched by PID 99 (flags: --merge)");
    expect(process.exitCode).toBe(EXIT.WATCHED);
  });

  it("takes no lock for a single --once tick", async () => {
    mockSummary.mockResolvedValue(aggregateResult);
    await main(["node", "shepherd", "stack", "43", "--once"]);
    expect(mockAggregate).not.toHaveBeenCalled();
    expect(process.exitCode).not.toBe(EXIT.WATCHED);
  });
});
