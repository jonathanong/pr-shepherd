import type { CheckConclusion } from "../types.mts";

const NON_FAILING_CONCLUSIONS = new Set<CheckConclusion>(["SUCCESS", "SKIPPED", "NEUTRAL"]);

/** True for conclusions that belong under `## Failing checks` (not success/skipped/neutral). */
function isFailingCheckConclusion(
  conclusion: CheckConclusion | undefined,
): conclusion is Exclude<CheckConclusion, "SUCCESS" | "SKIPPED" | "NEUTRAL"> {
  return conclusion == null || !NON_FAILING_CONCLUSIONS.has(conclusion);
}

/** Failing-check rows for formatter/instructions — excludes annotation-only carriers. */
export function isFailingAgentCheck(check: {
  conclusion: CheckConclusion;
  annotationOnly?: boolean;
}): boolean {
  return !check.annotationOnly && isFailingCheckConclusion(check.conclusion);
}
