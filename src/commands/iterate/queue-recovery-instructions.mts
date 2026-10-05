/** Instruction text for a PR that GitHub removed from the merge queue after failed checks. */

import type { AgentCheck, ShepherdReport } from "../../types.mts";
import { playbookPointer } from "../playbook-pointer.mts";

/**
 * Which recovery command, if any, Shepherd printed for a failure that does not reproduce.
 * `hold` marks a removal whose reason is not an automatic one, so a person may have dequeued it.
 */
export type QueueEjectionRecovery = "requeue" | "acknowledge" | "none" | "hold";

/** The removed queue commit whose failed checks this tick surfaces, if the removal is current. */
export function currentEjectionCommit(
  report: ShepherdReport,
  checks: AgentCheck[],
): string | undefined {
  const queue = report.mergeQueue;
  const commit = queue?.latestRemoval?.beforeCommitOid;
  if (!commit || queue.inQueue || queue.headUpdatedAfterRemoval) return undefined;
  return checks.some((check) => check.scope === "merge_group" && check.commitOid === commit)
    ? commit
    : undefined;
}

/** The ejection step after failing-check triage; points at a stack route already printed. */
export function queueEjectionSteps(
  recovery: QueueEjectionRecovery | undefined,
  stackRebase: string | undefined,
  routePrinted: boolean,
): string[] {
  if (!recovery) return [];
  if (recovery === "hold") return [HOLD_INSTRUCTION];
  const route = stackRebase && routePrinted ? "use the stack route printed above." : stackRebase;
  return [buildQueueEjectionInstruction(recovery, route)];
}

const HOLD_INSTRUCTION = `Triage the merge-queue ejection before any requeue. GitHub records no automatic reason for this removal, so a person may have dequeued the PR. Do not update the branch from base or enqueue the PR for this removal. Fix the failure only if it belongs to this PR. ${playbookPointer("Merge queue ejection")}`;

/** The trigger, update route, and command guard; the fixed procedure lives in the playbook. */
function buildQueueEjectionInstruction(
  recovery: QueueEjectionRecovery,
  stackRoute?: string,
): string {
  const update = stackRoute
    ? `Update the stack from the latest base first: ${stackRoute}`
    : "Update the PR head from the latest base first.";
  const reproduce =
    "only if the failure does not reproduce on the updated head, neither the update nor a code change altered the head, and no other blocker remains.";
  const guard =
    recovery === "requeue"
      ? `Run \`requeue:\` ${reproduce} If gh reports auto-merge is disabled, run \`requeue API fallback:\` instead.`
      : recovery === "acknowledge"
        ? `Run \`acknowledge queue removal:\` ${reproduce}`
        : "Shepherd printed no queue command for this session, so do not enqueue the PR.";
  return `Triage the merge-queue ejection before any requeue. ${update} ${guard} ${playbookPointer("Merge queue ejection")}`;
}
