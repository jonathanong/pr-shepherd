import { formatPrUrl } from "../../pr-reference.mts";
import type { IterateResult } from "../../types.mts";
import { TRIAGE_CONTINUATION } from "./check-instructions.mts";

/**
 * When the caller passed a qualified PR, name it in the plain `[TRIAGE]` recurrence step, so the
 * caller reruns the same target instead of shortening it to a bare number that resolves in the
 * local checkout. A bare target already reruns correctly. The caller owns the mode and flags.
 */
export function withTriageRerunTarget(result: IterateResult, qualified: boolean): IterateResult {
  if (!qualified || result.action !== "triage") return result;
  const instructions = result.triage.instructions;
  if (instructions.at(-1) !== TRIAGE_CONTINUATION) return result;
  const target = formatPrUrl(result.repo, result.pr);
  return {
    ...result,
    triage: {
      ...result.triage,
      instructions: [...instructions.slice(0, -1), `Rerun Shepherd now on \`${target}\`.`],
    },
  };
}
