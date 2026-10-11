import { evaluateRequiredChecks } from "../checks/required-check-state.mts";
import type { MergeStatusResult } from "../types.mts";
import type { ClassifiedCheck } from "../types/check-classification.mts";

/**
 * Attach the merge target's required contexts, and which of them are not passing, to
 * `mergeRequirements`. A native-stack layer's own base can carry no rules, so these
 * contexts come from the stack trunk and replace whatever the base reported.
 */
export function withRequiredCheckState(
  mergeStatus: MergeStatusResult,
  contexts: readonly string[],
  checks: readonly ClassifiedCheck[],
): MergeStatusResult {
  const requirements = mergeStatus.mergeRequirements;
  if (!requirements || contexts.length === 0) return mergeStatus;
  const { failing, pending } = evaluateRequiredChecks(contexts, checks);
  return {
    ...mergeStatus,
    mergeRequirements: {
      ...requirements,
      requiredStatusChecks: {
        contexts: [...contexts],
        ...(failing.length > 0 && { failing }),
        ...(pending.length > 0 && { pending }),
      },
    },
  };
}
