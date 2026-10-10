/** Identify cancelled checks covered by another run on the same commit and event. */

import type { CheckRun } from "../types.mts";

/** Prefer the stable workflow ID; retain the name fallback for the older-run rule. */
function workflowKeyOf(check: CheckRun): string | undefined {
  if (check.workflowId) return `id:${check.workflowId}`;
  return check.workflowName ? `name:${check.workflowName}` : undefined;
}

function groupKeyOf(check: CheckRun): string | undefined {
  const workflow = workflowKeyOf(check);
  if (workflow === undefined) return undefined;
  return JSON.stringify([workflow, check.event, check.scope ?? null, check.commitOid ?? null]);
}

function numericRunId(check: CheckRun): number | undefined {
  if (check.runId === null || !/^[1-9]\d*$/.test(check.runId)) return undefined;
  const id = Number(check.runId);
  return Number.isSafeInteger(id) ? id : undefined;
}

function validTimes(check: CheckRun, requireOrdered = true): boolean {
  const { startedAtUnix: start, completedAtUnix: completion } = check;
  return (
    typeof start === "number" &&
    Number.isFinite(start) &&
    start > 0 &&
    typeof completion === "number" &&
    Number.isFinite(completion) &&
    completion > 0 &&
    (!requireOrdered || completion >= start)
  );
}

/**
 * A later-created run supersedes an older cancellation as before. GitHub can start
 * check jobs out of run-ID order, so a lower-ID run can also cover a cancellation
 * when its matching successful job actually started and completed later. Cancelled
 * wrappers can report completion before start; compare both observed boundaries
 * without treating that reversed interval as a successful execution.
 */
export function buildSupersededIndices(checks: CheckRun[]): Set<number> {
  const maxRunIdByGroup = new Map<string, number>();
  const runIds = checks.map(numericRunId);
  checks.forEach((check, index) => {
    const group = groupKeyOf(check);
    const runId = runIds[index];
    if (group === undefined || runId === undefined) return;
    const previous = maxRunIdByGroup.get(group);
    if (previous === undefined || runId > previous) maxRunIdByGroup.set(group, runId);
  });

  const superseded = new Set<number>();
  checks.forEach((cancelled, index) => {
    if (cancelled.conclusion !== "CANCELLED") return;
    const group = groupKeyOf(cancelled);
    const runId = runIds[index];
    if (group === undefined || runId === undefined) return;
    if (maxRunIdByGroup.get(group)! > runId) {
      superseded.add(index);
      return;
    }

    if (
      cancelled.status !== "COMPLETED" ||
      !cancelled.workflowId ||
      cancelled.event === null ||
      !validTimes(cancelled, false)
    )
      return;
    const covered = checks.some((success, candidateIndex) => {
      const candidateRunId = runIds[candidateIndex];
      return (
        candidateRunId !== undefined &&
        candidateRunId < runId &&
        success.status === "COMPLETED" &&
        success.conclusion === "SUCCESS" &&
        success.workflowId === cancelled.workflowId &&
        success.event === cancelled.event &&
        success.scope === cancelled.scope &&
        success.commitOid === cancelled.commitOid &&
        success.name === cancelled.name &&
        validTimes(success) &&
        success.startedAtUnix! > cancelled.startedAtUnix! &&
        success.completedAtUnix! > cancelled.completedAtUnix!
      );
    });
    if (covered) superseded.add(index);
  });
  return superseded;
}
