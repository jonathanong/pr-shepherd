import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./process-start.mts", () => ({ readProcessStart: vi.fn(() => "start-A") }));

import { resolvePrStatePath } from "./base.mts";
import { EXIT } from "../exit-codes.mts";
import { acquireWatchLock, releaseAllWatchLocks } from "./watch-lock.mts";
import { createWatchSet, WatchedError } from "./watch-set.mts";

let seq = 0;
const freshRepo = () => ({ owner: "acme", name: `set-${(seq += 1)}` });

afterEach(() => {
  releaseAllWatchLocks();
  vi.restoreAllMocks();
});

/** A second watcher in this process: the lock is held by our PID, which is alive. */
function holdAsOther(repo: { owner: string; name: string }, pr: number, flags: string[]): void {
  acquireWatchLock(repo, pr, flags);
}

describe("createWatchSet", () => {
  it("claims every PR and reports none blocked", () => {
    const set = createWatchSet(freshRepo(), ["--merge"]);
    expect(set.claim([2, 4])).toEqual([]);
    set.releaseAll();
  });

  it("returns the holder of each PR another watcher already holds, claiming the rest", () => {
    const repo = freshRepo();
    holdAsOther(repo, 2, ["--merge"]);
    const set = createWatchSet(repo, []);
    const blocked = set.claim([2, 4]);
    expect(blocked.map((holder) => holder.pr)).toEqual([2]);
    expect(blocked[0]!.flags).toEqual(["--merge"]);
    expect(set.claim([4])).toEqual([]);
  });

  it("does not re-acquire a PR it already holds", () => {
    const set = createWatchSet(freshRepo(), []);
    set.claim([5]);
    expect(set.claim([5])).toEqual([]);
  });

  it("sync releases a PR whose row is cancel so another run can take it", () => {
    const repo = freshRepo();
    const set = createWatchSet(repo, []);
    set.claim([1, 2]);
    set.sync([
      { pr: 1, action: "cancel" },
      { pr: 2, action: "wait" },
    ]);
    expect(createWatchSet(repo, []).claim([1])).toEqual([]);
    expect(
      createWatchSet(repo, [])
        .claim([2])
        .map((holder) => holder.pr),
    ).toEqual([2]);
  });

  it("sync claims PRs that first appear, such as stack members", () => {
    const repo = freshRepo();
    const set = createWatchSet(repo, []);
    set.sync([{ pr: 9, action: "wait" }]);
    expect(createWatchSet(repo, []).claim([9])).toHaveLength(1);
  });

  it("sync throws WatchedError with the exit code when a member is held elsewhere", () => {
    const repo = freshRepo();
    holdAsOther(repo, 3, ["--until-terminal"]);
    const set = createWatchSet(repo, []);
    let caught: unknown;
    try {
      set.sync([
        { pr: 3, action: "wait" },
        { pr: 4, action: "wait" },
      ]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(WatchedError);
    expect((caught as WatchedError).exitCode).toBe(EXIT.WATCHED);
    expect((caught as WatchedError).holders.map((holder) => holder.pr)).toEqual([3]);
    expect((caught as WatchedError).repo).toEqual(repo);
  });

  it("sync ignores a cancel row it never held", () => {
    const set = createWatchSet(freshRepo(), []);
    expect(() => set.sync([{ pr: 8, action: "cancel" }])).not.toThrow();
  });

  it("releaseAll frees every held PR", () => {
    const repo = freshRepo();
    const set = createWatchSet(repo, []);
    set.claim([1, 2]);
    set.releaseAll();
    expect(createWatchSet(repo, []).claim([1, 2])).toEqual([]);
  });

  it("verify keeps locks that are still ours", () => {
    const set = createWatchSet(freshRepo(), []);
    set.claim([1, 2]);
    expect(set.verify()).toEqual([]);
  });

  it("verify recreates a lock removed by someone else", () => {
    const repo = freshRepo();
    const set = createWatchSet(repo, []);
    set.claim([1]);
    rmSync(resolvePrStatePath({ owner: repo.owner, repo: repo.name, pr: 1 }), {
      recursive: true,
      force: true,
    });
    expect(set.verify()).toEqual([]);
    expect(createWatchSet(repo, []).claim([1])).toHaveLength(1);
  });

  it("verify drops a PR another live process now holds and returns its holder", () => {
    const repo = freshRepo();
    const set = createWatchSet(repo, []);
    set.claim([1, 2]);
    const file = resolvePrStatePath(
      { owner: repo.owner, repo: repo.name, pr: 1 },
      "watch.lock.json",
    );
    const theirs = { pr: 1, pid: 424242, startedAt: "start-A", flags: ["--merge"] };
    writeFileSync(file, JSON.stringify(theirs));
    vi.spyOn(process, "kill").mockImplementation((() => true) as never);
    expect(set.verify()).toEqual([theirs]);
    expect(set.verify()).toEqual([]);
    set.releaseAll();
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(theirs);
  });
});
