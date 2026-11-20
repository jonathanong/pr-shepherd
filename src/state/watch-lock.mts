import { linkSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolvePrStatePath } from "./base.mts";
import { readProcessStart } from "./process-start.mts";

export interface WatchRepo {
  owner: string;
  name: string;
}

export interface WatchHolder {
  pr: number;
  pid: number;
  /** Opaque process start token; absent when the holder's start time could not be read. */
  startedAt?: string;
  /** The holder's relevant flags, such as `--merge`. */
  flags: string[];
}

export type AcquireResult = { acquired: true } | { acquired: false; holder: WatchHolder };

const LOCK_FILE = "watch.lock.json";
const GUARD_FILE = "watch.lock.guard";
const GUARD_STALE_MS = 10_000;
const ATTEMPTS = 4;
const held = new Map<string, { repo: WatchRepo; pr: number }>();
let hooksInstalled = false;
let tmpSeq = 0;

const keyOf = (repo: WatchRepo, pr: number): string => `${repo.owner}/${repo.name}#${pr}`;

const pathFor = (repo: WatchRepo, pr: number, file = LOCK_FILE): string =>
  resolvePrStatePath({ owner: repo.owner, repo: repo.name, pr }, file);

function readHolder(path: string): WatchHolder | undefined {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<WatchHolder>;
    const valid = Number.isInteger(parsed.pid) && parsed.pid! > 0 && Array.isArray(parsed.flags);
    return valid ? (parsed as WatchHolder) : undefined;
  } catch {
    return undefined;
  }
}

/** Only ESRCH proves the process is gone; EPERM (a sandbox hiding it) means it exists. */
function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

/** Dead holder, or a live PID whose readable start time differs (PID reuse). Unreadable start: alive. */
function isStale(holder: WatchHolder): boolean {
  if (!pidAlive(holder.pid)) return true;
  if (!holder.startedAt) return false;
  const current = readProcessStart(holder.pid);
  return current !== undefined && current !== holder.startedAt;
}

/** Publishes the full lock content atomically: the hard link fails with EEXIST when a lock exists. */
function linkLock(path: string, holder: WatchHolder): boolean {
  const tmp = `${path}.${process.pid}.${(tmpSeq += 1)}.tmp`;
  writeFileSync(tmp, JSON.stringify(holder));
  try {
    linkSync(tmp, path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  } finally {
    rmSync(tmp, { force: true });
  }
}

/** Only the holder of the guard may remove a stale lock, so two takeovers cannot both win. */
function takeOver(repo: WatchRepo, pr: number, mine: WatchHolder): boolean {
  const path = pathFor(repo, pr);
  const guard = pathFor(repo, pr, GUARD_FILE);
  try {
    writeFileSync(guard, "", { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    // A guard left by a crashed takeover must not block the PR forever.
    const guardMtime = statSync(guard, { throwIfNoEntry: false })?.mtimeMs ?? Date.now();
    if (Date.now() - guardMtime > GUARD_STALE_MS) {
      rmSync(guard, { force: true });
    }
    return false;
  }
  try {
    const current = readHolder(path);
    if (current && !isStale(current)) return false;
    rmSync(path, { force: true });
    return linkLock(path, mine);
  } finally {
    rmSync(guard, { force: true });
  }
}

/** Claims the per-PR watcher lock, taking it over from a dead or PID-reused holder. */
export function acquireWatchLock(repo: WatchRepo, pr: number, flags: string[]): AcquireResult {
  const path = pathFor(repo, pr);
  mkdirSync(dirname(path), { recursive: true });
  const startedAt = readProcessStart(process.pid);
  const mine: WatchHolder = { pr, pid: process.pid, ...(startedAt && { startedAt }), flags };
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    if (linkLock(path, mine) || takeOverIfStale(repo, pr, mine)) {
      track(repo, pr);
      return { acquired: true };
    }
    const current = readHolder(path);
    if (current && !isStale(current)) return { acquired: false, holder: current };
  }
  throw new Error(`could not acquire the watch lock for PR #${pr}`);
}

/**
 * Per-tick ownership check for a PR this process holds: one file read when the lock is still ours.
 * A missing or unreadable file is recreated (an `admin clean` may have removed the directory), a
 * stale holder is taken over, and a live other holder is left untouched and returned as lost.
 */
export function verifyWatchLock(repo: WatchRepo, pr: number, flags: string[]): AcquireResult {
  if (readHolder(pathFor(repo, pr))?.pid === process.pid) return { acquired: true };
  const result = acquireWatchLock(repo, pr, flags);
  if (!result.acquired) held.delete(keyOf(repo, pr));
  return result;
}

function takeOverIfStale(repo: WatchRepo, pr: number, mine: WatchHolder): boolean {
  const current = readHolder(pathFor(repo, pr));
  return (current === undefined || isStale(current)) && takeOver(repo, pr, mine);
}

/** Removes this process's lock for `pr`; another process's lock is never touched. */
export function releaseWatchLock(repo: WatchRepo, pr: number): void {
  held.delete(keyOf(repo, pr));
  const path = pathFor(repo, pr);
  if (readHolder(path)?.pid === process.pid) rmSync(path, { force: true });
}

export function releaseAllWatchLocks(): void {
  for (const { repo, pr } of held.values()) releaseWatchLock(repo, pr);
}

function track(repo: WatchRepo, pr: number): void {
  held.set(keyOf(repo, pr), { repo, pr });
  if (hooksInstalled) return;
  hooksInstalled = true;
  process.on("exit", releaseAllWatchLocks);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.once(signal, () => {
      releaseAllWatchLocks();
      process.kill(process.pid, signal);
    });
  }
}
