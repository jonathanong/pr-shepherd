import { runsSingleTick } from "../commands/single-tick.mts";
import { getRepoInfo } from "../github/client.mts";
import { createWatchSet, WatchedError, type WatchSet } from "../state/watch-set.mts";
import type { WatchRepo } from "../state/watch-lock.mts";
import { emitWatched, noteWatched } from "./watch-report.mts";

export interface WatchSpec {
  /** The repository the PRs live in; the checkout's `origin` when omitted. */
  repo?: WatchRepo;
  /** PRs this run will poll. Empty means no lock, unless `growing`. */
  prs: number[];
  /** A stack names its member PRs only after its first read, so they are locked per tick. */
  growing?: boolean;
  /** The holder flags worth comparing, such as `--merge`. */
  flags: string[];
  format: "text" | "json";
}

/** The flags a second caller would compare against: those that change what a watcher does. */
export function watchFlagsOf(options: {
  merge?: boolean;
  untilTerminal?: boolean;
  noAutoMarkReady?: boolean;
}): string[] {
  return [
    ...(options.merge ? ["--merge"] : []),
    ...(options.untilTerminal ? ["--until-terminal"] : []),
    ...(options.noAutoMarkReady ? ["--no-auto-mark-ready"] : []),
  ];
}

/**
 * Runs a repeating poll under per-PR watcher locks. PRs another live process already watches are
 * dropped and reported; when none remain, nothing polls and the process exits `EXIT.WATCHED`.
 * Cloud sessions run one tick per invocation, so they take no lock.
 */
export async function withWatchLock(
  spec: WatchSpec,
  run: (watch: WatchSet | undefined, prs: number[]) => Promise<void>,
): Promise<void> {
  if (runsSingleTick() || (spec.prs.length === 0 && spec.growing !== true)) {
    return run(undefined, spec.prs);
  }
  const repo = spec.repo ?? (await getRepoInfo());
  const watch = createWatchSet(repo, spec.flags);
  try {
    const blocked = watch.claim(spec.prs);
    if (spec.prs.length > 0 && blocked.length === spec.prs.length) {
      return emitWatched(repo, blocked, spec.format);
    }
    if (blocked.length > 0) noteWatched(repo, blocked);
    const skipped = new Set(blocked.map((holder) => holder.pr));
    await run(
      watch,
      spec.prs.filter((pr) => !skipped.has(pr)),
    );
  } catch (error) {
    if (!(error instanceof WatchedError)) throw error;
    emitWatched(repo, error.holders, spec.format);
  } finally {
    watch.releaseAll();
  }
}
