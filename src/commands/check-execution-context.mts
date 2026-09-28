import type { RepoInfo } from "../github/client.mts";
import { readStackTopology } from "../github/stack-read.mts";

/** Fresh for each iterate tick; never persisted or exposed in CLI output. */
export function createCheckExecutionContext() {
  const topologies = new Map<string, ReturnType<typeof readStackTopology>>();
  return {
    readStackTopology(pr: number, repo: RepoInfo): ReturnType<typeof readStackTopology> {
      const key = `${repo.owner.toLowerCase()}/${repo.name.toLowerCase()}#${pr}`;
      let pending = topologies.get(key);
      if (!pending) {
        pending = readStackTopology(pr, repo);
        topologies.set(key, pending);
      }
      return pending;
    },
  };
}

export type CheckExecutionContext = ReturnType<typeof createCheckExecutionContext>;
