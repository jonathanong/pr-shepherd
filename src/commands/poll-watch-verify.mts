import { noteWatched } from "../cli/watch-report.mts";
import { WatchedError } from "../state/watch-set.mts";
import type { AggregatePollCommandOptions } from "./poll-summary.mts";

/**
 * Before an aggregate tick, drop the PRs whose watcher lock another live process now holds and
 * report them. When nothing is left to watch (or a stack lost a layer), the run stops as watched.
 */
export function verifyWatchedPrs(opts: AggregatePollCommandOptions): AggregatePollCommandOptions {
  const lost = opts.watch?.verify() ?? [];
  if (lost.length === 0) return opts;
  const remaining = opts.prNumbers?.filter((pr) => !lost.some((holder) => holder.pr === pr));
  if (!remaining?.length) throw new WatchedError(opts.watch!.repo, lost);
  noteWatched(opts.watch!.repo, lost);
  return { ...opts, prNumbers: remaining };
}
