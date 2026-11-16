import { checkFollowUpKeys, sameCheckFollowUp } from "../../state/check-follow-up.mts";
import type { AgentCheck, IterateResult, IterateResultBase } from "../../types.mts";

/**
 * Failing checks that can still change because CI is still running: an Actions check whose own
 * run is in progress (no rerun is possible yet), and an external status with a details URL (no run
 * id, e.g. coverage) while any workflow run is in progress, since such statuses often flip once CI
 * finishes. They are shown once and then waited on. Queue checks and external approval gates
 * (`ACTION_REQUIRED`, which escalate at once) are never held back.
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
      (check.runId === null
        ? Boolean(check.detailsUrl) &&
          check.conclusion !== "ACTION_REQUIRED" &&
          activeRunIds.size > 0
        : activeRunIds.has(check.runId)),
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
  const runIds = [...new Set(checks.filter((c) => c.runId !== null).map((c) => c.runId))];
  const external = checks.filter((c) => c.runId === null).map((c) => c.name);
  const waiting = [...runIds.map((id) => `run ${id}`), ...external].join(", ");
  return {
    ...base,
    action: "wait",
    log: `WAIT: PR #${base.pr} failing checks already shown; their workflow run is still running (${waiting}) — waiting for it to complete`,
  } as IterateResult;
}
