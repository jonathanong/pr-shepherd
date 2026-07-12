/**
 * Detects check runs that are `CANCELLED` because a newer run of the *same workflow*
 * superseded them on the same commit (concurrency-group eviction), rather than a genuine
 * cancellation. Split out of classify.mts to stay under the file-length cap.
 */

import type { CheckRun } from "../types.mts";

/** Grouping key for a check's workflow: numeric `workflowId`, falling back to `workflowName`. */
function workflowKeyOf(check: CheckRun): string | undefined {
  return check.workflowId ?? check.workflowName;
}

/**
 * Grouping key is `workflowId ?? workflowName` — the numeric GitHub Actions workflow database
 * ID when available, falling back to the display name. Checks with neither a workflow identity
 * nor a numeric `runId` (status contexts, startup-failure synthetics) never participate: they
 * can neither be marked superseded nor count as evidence of a newer run.
 *
 * A check is superseded iff its own conclusion is `CANCELLED` and some other check sharing its
 * workflow key has a strictly greater `runId`. The newest run for a workflow is therefore never
 * superseded, even if it is itself cancelled — that case stays "failing" so the agent can decide
 * whether to rerun it.
 *
 * @returns Indices into `checks` (not object identities, since check-run objects are not
 *   deduplicated by reference elsewhere) that should be reclassified as "superseded".
 */
export function buildSupersededIndices(checks: CheckRun[]): Set<number> {
  const runIdByIndex = new Map<number, number>();
  const maxRunIdByWorkflow = new Map<string, number>();
  checks.forEach((check, index) => {
    const workflowKey = workflowKeyOf(check);
    if (workflowKey === undefined || check.runId === null) return;
    const runIdNum = Number(check.runId);
    if (!Number.isFinite(runIdNum)) return;
    runIdByIndex.set(index, runIdNum);
    const currentMax = maxRunIdByWorkflow.get(workflowKey);
    if (currentMax === undefined || runIdNum > currentMax) {
      maxRunIdByWorkflow.set(workflowKey, runIdNum);
    }
  });

  const superseded = new Set<number>();
  checks.forEach((check, index) => {
    if (check.conclusion !== "CANCELLED") return;
    const runIdNum = runIdByIndex.get(index);
    if (runIdNum === undefined) return;
    // workflowKeyOf(check) is guaranteed defined here, with a corresponding entry in
    // maxRunIdByWorkflow: runIdByIndex is only ever populated in the loop above alongside a
    // maxRunIdByWorkflow entry for that same workflow key (at minimum, this check's own
    // runIdNum) — the two maps are always updated together for a given index. A defensive
    // undefined-check here would therefore guard a branch no input can ever exercise, which
    // would silently fail this repo's 100%-coverage requirement instead of catching a real bug.
    const maxRunId = maxRunIdByWorkflow.get(workflowKeyOf(check)!)!;
    if (maxRunId > runIdNum) {
      superseded.add(index);
    }
  });
  return superseded;
}
