import { EXIT, ShepherdError } from "../exit-codes.mts";
import {
  acquireWatchLock,
  releaseWatchLock,
  type WatchHolder,
  type WatchRepo,
} from "./watch-lock.mts";

/** Thrown when a PR a run needs turns out to be watched by another live process. */
export class WatchedError extends ShepherdError {
  readonly repo: WatchRepo;
  readonly holders: WatchHolder[];

  constructor(repo: WatchRepo, holders: WatchHolder[]) {
    super("PR is already watched by another pr-shepherd process", EXIT.WATCHED);
    this.name = "WatchedError";
    this.repo = repo;
    this.holders = holders;
  }
}

/** The per-PR locks one repeating run holds. */
export interface WatchSet {
  readonly repo: WatchRepo;
  /** Locks the PRs not yet held; returns the holders of those another process already watches. */
  claim(prs: number[]): WatchHolder[];
  /** After a tick: releases rows that stopped, claims rows that appeared; throws if one is watched. */
  sync(rows: ReadonlyArray<{ pr: number; action: string }>): void;
  releaseAll(): void;
}

export function createWatchSet(repo: WatchRepo, flags: string[]): WatchSet {
  const held = new Set<number>();
  const release = (pr: number): void => {
    held.delete(pr);
    releaseWatchLock(repo, pr);
  };
  const claim = (prs: number[]): WatchHolder[] => {
    const blocked: WatchHolder[] = [];
    for (const pr of prs.filter((candidate) => !held.has(candidate))) {
      const result = acquireWatchLock(repo, pr, flags);
      if (result.acquired) held.add(pr);
      else blocked.push(result.holder);
    }
    return blocked;
  };
  return {
    repo,
    claim,
    sync(rows) {
      for (const row of rows) if (row.action === "cancel" && held.has(row.pr)) release(row.pr);
      const blocked = claim(rows.filter((row) => row.action !== "cancel").map((row) => row.pr));
      if (blocked.length > 0) throw new WatchedError(repo, blocked);
    },
    releaseAll() {
      for (const pr of held) release(pr);
    },
  };
}
