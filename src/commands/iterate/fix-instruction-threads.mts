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

export function reviewSectionRefs(input: {
  hasReviewThreads: boolean;
  hasUnlocatedSkipThreads: boolean;
  hasActionableComments: boolean;
  hasFailingChecks: boolean;
  hasAnnotations: boolean;
  hasChangesRequested: boolean;
}): string[] {
  const sections: string[] = [];
  if (input.hasReviewThreads) sections.push("`## Review threads`");
  if (input.hasUnlocatedSkipThreads)
    sections.push("`## Unlocated review threads (logged once — no mutation)`");
  if (input.hasActionableComments) sections.push("`## Actionable comments`");
  if (input.hasFailingChecks) sections.push("`## Failing checks`");
  if (input.hasAnnotations) sections.push("`## Check annotations`");
  if (input.hasChangesRequested) sections.push("`## Changes-requested reviews`");
  return sections;
}
