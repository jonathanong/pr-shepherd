import { checkFollowUpKeys, sameCheckFollowUp } from "../../state/check-follow-up.mts";
import type { AgentCheck, IterateResult, IterateResultBase } from "../../types.mts";

/**
 * Failing checks whose workflow run is still in progress. A rerun is not possible until the run
 * completes, so these are shown once and then waited on. Queue checks are never held back.
 */
export function activeRunFailures(
  failing: readonly AgentCheck[],
  activeRunIds: ReadonlySet<string>,
  released: ReadonlySet<string>,
): AgentCheck[] {
  return failing.filter(
    (check) =>
      !released.has(check.name) &&
      check.scope !== "merge_group" &&
      check.runId !== null &&
      activeRunIds.has(check.runId),
  );
}

/** Identity of a shown failure set: name, run id, and attempt. */
export const runFailureKeys = checkFollowUpKeys;

/** True when this head and check set were already shown on a presented tick. */
export const runFailuresShown = sameCheckFollowUp;

/** The WAIT that replaces a repeated TRIAGE for already-shown failures in a running run. */
export function buildRunFailureWait(
  base: IterateResultBase,
  checks: readonly AgentCheck[],
): IterateResult {
  const runIds = [...new Set(checks.map((c) => c.runId))].join(", ");
  return {
    ...base,
    action: "wait",
    log: `WAIT: PR #${base.pr} failing checks already shown; their workflow run is still running (run ${runIds}) — waiting for it to complete`,
  } as IterateResult;
}
