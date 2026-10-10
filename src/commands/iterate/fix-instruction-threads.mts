import type { AgentThread, ResolveCommand } from "../../types.mts";

function mutatedThreadIdSet(
  resolveCommand: ResolveCommand,
  resolveOnlyCommand?: ResolveCommand,
): Set<string> {
  return new Set([
    ...(resolveCommand.replyThreadIds ?? []),
    ...(resolveCommand.resolveThreadIds ?? []),
    ...(resolveOnlyCommand?.replyThreadIds ?? []),
    ...(resolveOnlyCommand?.resolveThreadIds ?? []),
  ]);
}

export function partitionFixThreads(
  threads: AgentThread[],
  resolveCommand: ResolveCommand,
  resolveOnlyCommand?: ResolveCommand,
): {
  locatedThreads: AgentThread[];
  unlocatedMutatedThreads: AgentThread[];
  unlocatedThreads: AgentThread[];
} {
  const mutatedThreadIds = mutatedThreadIdSet(resolveCommand, resolveOnlyCommand);
  return {
    locatedThreads: threads.filter((thread) => thread.path !== null && thread.line !== null),
    unlocatedMutatedThreads: threads.filter(
      (thread) => (thread.path === null || thread.line === null) && mutatedThreadIds.has(thread.id),
    ),
    unlocatedThreads: threads.filter(
      (thread) =>
        (thread.path === null || thread.line === null) && !mutatedThreadIds.has(thread.id),
    ),
  };
}
