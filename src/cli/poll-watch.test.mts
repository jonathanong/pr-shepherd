import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../state/process-start.mts", () => ({ readProcessStart: vi.fn(() => "start-A") }));
vi.mock("../github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "acme", name: "checkout" }),
}));

import { EXIT } from "../exit-codes.mts";
import { getRepoInfo } from "../github/client.mts";
import { acquireWatchLock, releaseAllWatchLocks } from "../state/watch-lock.mts";
import { WatchedError } from "../state/watch-set.mts";
import { watchFlagsOf, withWatchLock } from "./poll-watch.mts";

let seq = 0;
let repo: { owner: string; name: string };
let out: string[];
let err: string[];

const spec = (prs: number[], extra: object = {}) => ({
  repo,
  prs,
  flags: ["--merge"],
  format: "text" as const,
  ...extra,
});

beforeEach(() => {
  repo = { owner: "acme", name: `watch-${(seq += 1)}` };
  out = [];
  err = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => out.push(String(chunk)) > 0);
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => err.push(String(chunk)) > 0);
});
afterEach(() => {
  process.exitCode = undefined;
  releaseAllWatchLocks();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("watchFlagsOf", () => {
  it("lists only the flags that change what a watcher does", () => {
    expect(watchFlagsOf({ merge: true, untilTerminal: true, noAutoMarkReady: true })).toEqual([
      "--merge",
      "--until-terminal",
      "--no-auto-mark-ready",
    ]);
    expect(watchFlagsOf({ merge: false })).toEqual([]);
  });
});

describe("withWatchLock", () => {
  it("runs with the lock held and releases it afterwards", async () => {
    const seen: number[][] = [];
    await withWatchLock(spec([2, 4]), async (watch, prs) => {
      seen.push(prs);
      // A second run started now sees both PRs watched.
      expect(watch).toBeDefined();
      await withWatchLock(spec([2, 4]), async () => void seen.push([-1]));
    });
    expect(seen).toEqual([[2, 4]]);
    expect(process.exitCode).toBe(EXIT.WATCHED);
    let ran = false;
    process.exitCode = undefined;
    await withWatchLock(spec([2, 4]), async () => void (ran = true));
    expect(ran).toBe(true);
    expect(process.exitCode).toBeUndefined();
  });

  it("exits without polling when the one requested PR is held by a live watcher", async () => {
    const run = vi.fn();
    await withWatchLock(spec([2, 3]), async () => {
      await withWatchLock(spec([2]), run);
    });
    expect(run).not.toHaveBeenCalled();
    expect(out.join("")).toContain("PR #2 is already watched by PID");
    expect(out.join("")).toContain("flags: --merge");
    expect(process.exitCode).toBe(EXIT.WATCHED);
  });

  it("watches only the free PRs and reports the held one on stderr (partial overlap)", async () => {
    const run = vi.fn(async () => {});
    await withWatchLock(spec([2]), async () => {
      await withWatchLock(spec([2, 4]), run);
    });
    expect(run).toHaveBeenCalledWith(expect.anything(), [4]);
    expect(err.join("")).toContain("PR #2 is already watched");
    expect(err.join("")).not.toContain("PR #4");
    expect(out.join("")).toBe("");
    expect(process.exitCode).toBeUndefined();
  });

  it("prints the JSON report when every PR is held and the format is json", async () => {
    await withWatchLock(spec([2]), async () => {
      await withWatchLock(spec([2], { format: "json" }), vi.fn());
    });
    const parsed = JSON.parse(out.join(""));
    expect(parsed.alreadyWatched).toEqual([{ pr: 2, pid: process.pid, flags: ["--merge"] }]);
    expect(parsed.mode).toBe("watch-lock");
  });

  it("takes no lock for a run with no PR to lock", async () => {
    const run = vi.fn(async () => {});
    await withWatchLock(spec([]), run);
    expect(run).toHaveBeenCalledWith(undefined, []);
    expect(getRepoInfo).not.toHaveBeenCalled();
  });

  it("takes no lock in a cloud session, which runs one tick per invocation", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    const run = vi.fn(async () => {});
    await withWatchLock(spec([2]), run);
    expect(run).toHaveBeenCalledWith(undefined, [2]);
    expect(acquireWatchLock(repo, 2, []).acquired).toBe(true);
  });

  it("locks growing selections such as a stack even with no PR yet, using the checkout repo", async () => {
    const run = vi.fn(async () => {});
    await withWatchLock({ prs: [], growing: true, flags: [], format: "text" }, run);
    expect(getRepoInfo).toHaveBeenCalled();
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ repo: expect.anything() }), []);
    expect(process.exitCode).toBeUndefined();
  });

  it("reports a WatchedError raised mid-run and still releases the locks", async () => {
    await withWatchLock(spec([2], { growing: true }), async (watch) => {
      expect(watch).toBeDefined();
      throw new WatchedError(repo, [{ pr: 9, pid: 77, flags: [] }]);
    });
    expect(out.join("")).toContain("PR #9 is already watched by PID 77");
    expect(process.exitCode).toBe(EXIT.WATCHED);
    expect(acquireWatchLock(repo, 2, []).acquired).toBe(true);
  });

  it("rethrows other errors after releasing the locks", async () => {
    await expect(
      withWatchLock(spec([2]), async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(acquireWatchLock(repo, 2, []).acquired).toBe(true);
  });
});
