import type { WatchTarget } from "./types.mts";

export const ownerOf = (repo: string): string => repo.split("/")[0]!.toLowerCase();

/**
 * Per-run source health. An owner the token cannot read stays uncovered for the run; transient
 * trouble (5xx, network, gap) is tracked as a flag so each state change is noted exactly once.
 */
export interface EventHealth {
  /** True when no watched owner is uncovered, so an event wait is worth attempting. */
  covers(targets: readonly WatchTarget[]): boolean;
  markUncovered(owner: string, reason: string): void;
  markUnhealthy(reason: string): void;
  markHealthy(): void;
}

export function createHealth(note: (message: string) => void): EventHealth {
  const uncovered = new Set<string>();
  let unhealthy = false;
  return {
    covers: (targets) =>
      targets.length > 0 && targets.every((target) => !uncovered.has(ownerOf(target.repo))),
    markUncovered(owner, reason) {
      const key = owner.toLowerCase();
      if (uncovered.has(key)) return;
      uncovered.add(key);
      note(`events: ${owner} is not covered by this token (${reason}); polling it normally`);
    },
    markUnhealthy(reason) {
      if (unhealthy) return;
      unhealthy = true;
      note(`events: source unhealthy (${reason}); polling normally until it recovers`);
    },
    markHealthy() {
      if (!unhealthy) return;
      unhealthy = false;
      note("events: source recovered");
    },
  };
}
