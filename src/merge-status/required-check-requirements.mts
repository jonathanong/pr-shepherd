import type { MergeStatusResult } from "../types.mts";

/**
 * A native-stack layer merges under the stack trunk's rules, not its parent branch's, so
 * replace the parent's required contexts with the trunk's. A trunk with none clears them.
 * Any other PR keeps the contexts derived from its own base.
 */
export function withTrunkRequiredContexts(
  mergeStatus: MergeStatusResult,
  contexts: readonly string[],
): MergeStatusResult {
  const requirements = mergeStatus.mergeRequirements;
  if (!requirements?.stack) return mergeStatus;
  const { requiredStatusChecks: _parent, ...rest } = requirements;
  return {
    ...mergeStatus,
    mergeRequirements:
      contexts.length > 0 ? { ...rest, requiredStatusChecks: { contexts: [...contexts] } } : rest,
  };
}
