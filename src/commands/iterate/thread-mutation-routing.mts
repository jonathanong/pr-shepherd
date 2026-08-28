import {
  isConfiguredBotAuthor,
  isHumanAuthor,
  isViewerAuthoredHuman,
  type NormalizedBotUsernames,
} from "../../comments/authors.mts";
import { threadEndedByShepherd } from "../../comments/marker.mts";
import type { AgentThread, ReviewThread } from "../../types.mts";

function dedupeIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

export interface ThreadMutationRouting {
  replyThreadIds: string[];
  pairedResolveThreadIds: string[];
  standaloneResolveThreadIds: string[];
  resolveThreadIds: string[];
}

export function buildThreadMutationRouting(
  threads: Array<AgentThread | ReviewThread>,
  botUsernames: NormalizedBotUsernames,
  ruleAutoResolveThreadIds: string[],
): ThreadMutationRouting {
  const isOrdinaryHuman = (thread: AgentThread | ReviewThread): boolean =>
    isHumanAuthor(thread) && !isConfiguredBotAuthor(thread, botUsernames);
  const replyThreadIds = dedupeIds(
    threads
      .filter((thread) => isOrdinaryHuman(thread) && !threadEndedByShepherd(thread))
      .map((thread) => thread.id),
  );
  const pairedResolveThreadIds = dedupeIds(
    threads
      .filter(
        (thread) => isViewerAuthoredHuman(thread, botUsernames) && !threadEndedByShepherd(thread),
      )
      .map((thread) => thread.id),
  );
  const pairedResolveIdSet = new Set(pairedResolveThreadIds);
  // Rule-matched threads bypass author routing; resolve-mutate retains the human-author guard.
  const standaloneResolveThreadIds = dedupeIds([
    ...threads
      .filter(
        (thread) =>
          !isOrdinaryHuman(thread) ||
          (isViewerAuthoredHuman(thread, botUsernames) && threadEndedByShepherd(thread)),
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
