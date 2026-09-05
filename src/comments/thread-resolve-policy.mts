import type { ResolveOtherHumanThreads } from "../config/load.mts";
import type { AgentThread, ReviewThread } from "../types.mts";

type OutdatableThread = AgentThread | ReviewThread;

function threadIsOutdated(thread: OutdatableThread): boolean {
  return "isOutdated" in thread && thread.isOutdated === true;
}

/** Other-human threads are resolved only when the iterate enum allows it. */
export function shouldResolveOtherHumanThread(
  thread: OutdatableThread,
  policy: ResolveOtherHumanThreads,
): boolean {
  if (policy === "always") return true;
  return policy === "outdated" && threadIsOutdated(thread);
}
