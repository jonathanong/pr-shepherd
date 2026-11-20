/* eslint-disable max-lines */
import { existsSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fsHooks = vi.hoisted(() => ({
  link: undefined as undefined | ((from: string, to: string) => void),
  write: undefined as undefined | ((path: string) => void),
  stat: undefined as undefined | (() => unknown),
}));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    linkSync: (from: string, to: string) => (fsHooks.link ?? actual.linkSync)(from, to),
    writeFileSync: (...args: Parameters<typeof actual.writeFileSync>) => {
      fsHooks.write?.(String(args[0]));
      return actual.writeFileSync(...args);
    },
    statSync: (...args: Parameters<typeof actual.statSync>) =>
      fsHooks.stat ? fsHooks.stat() : actual.statSync(...args),
  };
});
vi.mock("./process-start.mts", () => ({ readProcessStart: vi.fn(() => "start-A") }));

import { resolvePrStatePath } from "./base.mts";
import { readProcessStart } from "./process-start.mts";
import {
  acquireWatchLock,
  releaseAllWatchLocks,
  releaseWatchLock,
  verifyWatchLock,
} from "./watch-lock.mts";

const mockStart = vi.mocked(readProcessStart);
const OTHER = 424242;
let seq = 0;
let repo: { owner: string; name: string };

const lockFile = (pr: number, file = "watch.lock.json"): string =>
  resolvePrStatePath({ owner: repo.owner, repo: repo.name, pr }, file);

function writeLock(pr: number, holder: object | string): void {
  const path = lockFile(pr);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof holder === "string" ? holder : JSON.stringify(holder));
}

const errno = (code: string): NodeJS.ErrnoException =>
  Object.assign(new Error(code), { code }) as NodeJS.ErrnoException;

/** `process.kill(pid, 0)` outcomes per PID: "alive", or an errno code to throw. Our own PID is alive. */
function mockKill(outcomes: Record<number, string>): void {
  vi.spyOn(process, "kill").mockImplementation(((pid: number) => {
    const outcome = outcomes[pid] ?? "alive";
    if (outcome !== "alive") throw errno(outcome);
    return true;
  }) as typeof process.kill);
}

beforeEach(() => {
  seq += 1;
  repo = { owner: "acme", name: `widgets-${seq}` };
  mockStart.mockReset().mockReturnValue("start-A");
});
afterEach(() => {
  releaseAllWatchLocks();
  vi.restoreAllMocks();
  fsHooks.link = fsHooks.write = fsHooks.stat = undefined;
});

describe("acquireWatchLock", () => {
  it("writes the PID, start time, and flags into the per-PR state directory", () => {
    expect(acquireWatchLock(repo, 7, ["--merge"])).toEqual({ acquired: true });
    expect(JSON.parse(readFileSync(lockFile(7), "utf8"))).toEqual({
      pr: 7,
      pid: process.pid,
      startedAt: "start-A",
      flags: ["--merge"],
    });
    expect(lockFile(7)).toContain(`${repo.owner}/${repo.name}/7/`);
  });

  it("omits startedAt when the start time cannot be read", () => {
    mockStart.mockReturnValue(undefined);
    acquireWatchLock(repo, 7, []);
    expect(JSON.parse(readFileSync(lockFile(7), "utf8"))).not.toHaveProperty("startedAt");
  });

  it("reports the live holder and its flags on contention", () => {
    mockKill({});
    writeLock(7, { pr: 7, pid: OTHER, startedAt: "start-A", flags: ["--merge"] });
    expect(acquireWatchLock(repo, 7, [])).toEqual({
      acquired: false,
      holder: { pr: 7, pid: OTHER, startedAt: "start-A", flags: ["--merge"] },
    });
    expect(JSON.parse(readFileSync(lockFile(7), "utf8")).pid).toBe(OTHER);
  });

  it("lets two PRs be held independently", () => {
    mockKill({});
    writeLock(2, { pr: 2, pid: OTHER, startedAt: "start-A", flags: [] });
    expect(acquireWatchLock(repo, 2, []).acquired).toBe(false);
    expect(acquireWatchLock(repo, 4, []).acquired).toBe(true);
  });

  it("takes over a lock whose holder PID is gone (ESRCH)", () => {
    mockKill({ [OTHER]: "ESRCH" });
    writeLock(7, { pr: 7, pid: OTHER, startedAt: "start-A", flags: [] });
    expect(acquireWatchLock(repo, 7, ["--until-terminal"])).toEqual({ acquired: true });
    expect(JSON.parse(readFileSync(lockFile(7), "utf8")).pid).toBe(process.pid);
    expect(existsSync(lockFile(7, "watch.lock.guard"))).toBe(false);
  });

  it("takes over when the PID is alive but its start time differs (PID reuse)", () => {
    mockKill({});
    mockStart.mockImplementation((pid) => (pid === OTHER ? "start-NEW" : "start-A"));
    writeLock(7, { pr: 7, pid: OTHER, startedAt: "start-OLD", flags: [] });
    expect(acquireWatchLock(repo, 7, []).acquired).toBe(true);
    expect(JSON.parse(readFileSync(lockFile(7), "utf8")).pid).toBe(process.pid);
  });

  it("treats EPERM (a sandbox hiding the process) as alive and keeps the lock", () => {
    mockKill({ [OTHER]: "EPERM" });
    mockStart.mockReturnValue(undefined);
    writeLock(7, { pr: 7, pid: OTHER, startedAt: "start-A", flags: [] });
    expect(acquireWatchLock(repo, 7, []).acquired).toBe(false);
  });

  it("does not take over when the start time cannot be read for a live PID", () => {
    mockKill({});
    mockStart.mockImplementation((pid) => (pid === OTHER ? undefined : "start-A"));
    writeLock(7, { pr: 7, pid: OTHER, startedAt: "start-A", flags: [] });
    expect(acquireWatchLock(repo, 7, []).acquired).toBe(false);
  });

  it("takes over on EPERM only when a start time was read and differs", () => {
    mockKill({ [OTHER]: "EPERM" });
    mockStart.mockImplementation((pid) => (pid === OTHER ? "start-NEW" : "start-A"));
    writeLock(7, { pr: 7, pid: OTHER, startedAt: "start-OLD", flags: [] });
    expect(acquireWatchLock(repo, 7, []).acquired).toBe(true);
  });

  it("keeps a live holder that recorded no start time", () => {
    mockKill({});
    writeLock(7, { pr: 7, pid: OTHER, flags: [] });
    expect(acquireWatchLock(repo, 7, []).acquired).toBe(false);
  });

  it.each(["not json", "{}", JSON.stringify({ pid: -1, flags: [] })])(
    "takes over a corrupt lock (%s)",
    (content) => {
      writeLock(7, content);
      expect(acquireWatchLock(repo, 7, []).acquired).toBe(true);
    },
  );

  it("gives up with an error while another takeover holds a fresh guard", () => {
    mockKill({ [OTHER]: "ESRCH" });
    writeLock(7, { pr: 7, pid: OTHER, flags: [] });
    writeFileSync(lockFile(7, "watch.lock.guard"), "");
    expect(() => acquireWatchLock(repo, 7, [])).toThrow("could not acquire the watch lock");
  });

  it("removes a guard left by a crashed takeover and then acquires", () => {
    mockKill({ [OTHER]: "ESRCH" });
    writeLock(7, { pr: 7, pid: OTHER, flags: [] });
    const guard = lockFile(7, "watch.lock.guard");
    writeFileSync(guard, "");
    const old = new Date(Date.now() - 60_000);
    utimesSync(guard, old, old);
    expect(acquireWatchLock(repo, 7, []).acquired).toBe(true);
  });

  it("tolerates a guard that vanishes before it is inspected", () => {
    mockKill({ [OTHER]: "ESRCH" });
    writeLock(7, { pr: 7, pid: OTHER, flags: [] });
    writeFileSync(lockFile(7, "watch.lock.guard"), "");
    fsHooks.stat = () => undefined;
    expect(() => acquireWatchLock(repo, 7, [])).toThrow("could not acquire");
  });

  it("yields to a lock that turns live between the staleness check and the guard", () => {
    let calls = 0;
    vi.spyOn(process, "kill").mockImplementation((() => {
      calls += 1;
      if (calls === 1) throw errno("ESRCH");
      return true;
    }) as typeof process.kill);
    writeLock(7, { pr: 7, pid: OTHER, flags: [] });
    expect(acquireWatchLock(repo, 7, [])).toMatchObject({ acquired: false });
    expect(existsSync(lockFile(7, "watch.lock.guard"))).toBe(false);
  });

  it("rethrows a link failure that is not EEXIST", () => {
    fsHooks.link = () => {
      throw errno("EACCES");
    };
    expect(() => acquireWatchLock(repo, 7, [])).toThrow("EACCES");
  });

  it("rethrows a guard creation failure that is not EEXIST", () => {
    mockKill({ [OTHER]: "ESRCH" });
    writeLock(7, { pr: 7, pid: OTHER, flags: [] });
    fsHooks.write = (path) => {
      if (path.endsWith(".guard")) throw errno("EACCES");
    };
    expect(() => acquireWatchLock(repo, 7, [])).toThrow("EACCES");
  });
});

describe("releaseWatchLock", () => {
  it("removes this process's lock", () => {
    acquireWatchLock(repo, 7, []);
    releaseWatchLock(repo, 7);
    expect(existsSync(lockFile(7))).toBe(false);
    expect(acquireWatchLock(repo, 7, []).acquired).toBe(true);
  });

  it("never removes another process's lock", () => {
    writeLock(7, { pr: 7, pid: OTHER, flags: [] });
    releaseWatchLock(repo, 7);
    expect(existsSync(lockFile(7))).toBe(true);
  });

  it("releaseAllWatchLocks removes every lock this process holds", () => {
    acquireWatchLock(repo, 1, []);
    acquireWatchLock(repo, 2, []);
    releaseAllWatchLocks();
    expect(existsSync(lockFile(1))).toBe(false);
    expect(existsSync(lockFile(2))).toBe(false);
  });
});

describe("verifyWatchLock", () => {
  it("keeps a lock that still names this process without checking liveness", () => {
    acquireWatchLock(repo, 7, ["--merge"]);
    const kill = vi.spyOn(process, "kill");
    mockStart.mockClear();
    expect(verifyWatchLock(repo, 7, ["--merge"])).toEqual({ acquired: true });
    expect(kill).not.toHaveBeenCalled();
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("recreates a lock file that was deleted", () => {
    acquireWatchLock(repo, 7, ["--merge"]);
    rmSync(lockFile(7));
    expect(verifyWatchLock(repo, 7, ["--merge"])).toEqual({ acquired: true });
    expect(JSON.parse(readFileSync(lockFile(7), "utf8"))).toMatchObject({
      pid: process.pid,
      flags: ["--merge"],
    });
  });

  it("recreates the whole state directory when `admin clean` removed it mid-run", () => {
    acquireWatchLock(repo, 7, []);
    rmSync(dirname(lockFile(7)), { recursive: true, force: true });
    expect(verifyWatchLock(repo, 7, [])).toEqual({ acquired: true });
    expect(existsSync(lockFile(7))).toBe(true);
  });

  it("recreates an unreadable lock file", () => {
    acquireWatchLock(repo, 7, []);
    writeFileSync(lockFile(7), "garbage");
    expect(verifyWatchLock(repo, 7, [])).toEqual({ acquired: true });
    expect(JSON.parse(readFileSync(lockFile(7), "utf8")).pid).toBe(process.pid);
  });

  it("takes over a lock that now names a stale holder", () => {
    acquireWatchLock(repo, 7, []);
    mockKill({ [OTHER]: "ESRCH" });
    writeLock(7, { pr: 7, pid: OTHER, flags: [] });
    expect(verifyWatchLock(repo, 7, [])).toEqual({ acquired: true });
    expect(JSON.parse(readFileSync(lockFile(7), "utf8")).pid).toBe(process.pid);
  });

  it("reports a live other holder as lost and leaves its file alone", () => {
    acquireWatchLock(repo, 7, []);
    mockKill({});
    const theirs = { pr: 7, pid: OTHER, startedAt: "start-A", flags: ["--merge"] };
    writeLock(7, theirs);
    expect(verifyWatchLock(repo, 7, [])).toEqual({ acquired: false, holder: theirs });
    releaseAllWatchLocks();
    expect(JSON.parse(readFileSync(lockFile(7), "utf8"))).toEqual(theirs);
  });
});
