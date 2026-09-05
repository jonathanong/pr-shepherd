import {
  isConfiguredBotAuthor,
  isHumanAuthor,
  isViewerAuthoredHuman,
  type NormalizedBotUsernames,
} from "../../comments/authors.mts";
import { threadEndedByShepherd } from "../../comments/marker.mts";
import { shouldResolveOtherHumanThread } from "../../comments/thread-resolve-policy.mts";
import type { ResolveOtherHumanThreads } from "../../config/load.mts";
import type { AgentThread, ReviewThread } from "../../types.mts";

export { shouldResolveOtherHumanThread };

export type RoutableThread = AgentThread | ReviewThread;

function dedupeIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

export interface ThreadMutationRouting {
  replyThreadIds: string[];
  pairedResolveThreadIds: string[];
  standaloneResolveThreadIds: string[];
  resolveThreadIds: string[];
}

function isOrdinaryHuman(thread: RoutableThread, botUsernames: NormalizedBotUsernames): boolean {
  return isHumanAuthor(thread) && !isConfiguredBotAuthor(thread, botUsernames);
}

function shouldPairResolve(
  thread: RoutableThread,
  botUsernames: NormalizedBotUsernames,
  policy: ResolveOtherHumanThreads = "none",
): boolean {
  if (!isOrdinaryHuman(thread, botUsernames)) return true;
  if (isViewerAuthoredHuman(thread, botUsernames)) return true;
  return shouldResolveOtherHumanThread(thread, policy);
}

export function threadHasAuthorizedMutation(
  thread: { id: string; viewerCanReply?: boolean; viewerCanResolve?: boolean },
  replyThreadIds: ReadonlySet<string>,
  resolveThreadIds: ReadonlySet<string>,
): boolean {
  const inReply = replyThreadIds.has(thread.id);
  const inResolve = resolveThreadIds.has(thread.id);
  if (!inReply && !inResolve) return false;
  if (inReply && thread.viewerCanReply !== true) return false;
  if (inResolve && thread.viewerCanResolve !== true) return false;
  return true;
}

export function buildThreadMutationRouting(
  threads: RoutableThread[],
  botUsernames: NormalizedBotUsernames,
  ruleAutoResolveThreadIds: string[],
  policy: ResolveOtherHumanThreads = "none",
): ThreadMutationRouting {
  const replyThreadIds = dedupeIds(
    threads.filter((thread) => !threadEndedByShepherd(thread)).map((thread) => thread.id),
  );
  const pairedResolveThreadIds = dedupeIds(
    threads
      .filter(
        (thread) =>
          shouldPairResolve(thread, botUsernames, policy) && !threadEndedByShepherd(thread),
      )
      .map((thread) => thread.id),
  );
  const pairedResolveIdSet = new Set(pairedResolveThreadIds);
  // Rule-matched threads bypass author routing; resolve-mutate retains the human-author guard.
  const standaloneResolveThreadIds = dedupeIds([
    ...threads
      .filter(
        (thread) =>
          shouldPairResolve(thread, botUsernames, policy) && threadEndedByShepherd(thread),
      )
      .map((thread) => thread.id),
    ...ruleAutoResolveThreadIds,
  ]).filter((id) => !pairedResolveIdSet.has(id));

  return {
    replyThreadIds,
    pairedResolveThreadIds,
    standaloneResolveThreadIds,
    resolveThreadIds: dedupeIds([...pairedResolveThreadIds, ...standaloneResolveThreadIds]),
  };
}
