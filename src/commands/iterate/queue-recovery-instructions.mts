/** Instruction text for a PR that GitHub removed from the merge queue after failed checks. */

import type { AgentCheck, ShepherdReport } from "../../types.mts";
import { playbookPointer } from "../playbook-pointer.mts";

/** Which recovery command, if any, Shepherd printed for a failure that does not reproduce. */
type QueueEjectionRecovery = "requeue" | "acknowledge" | "none";

interface QueueEjectionInput {
  /** The printed native-stack rebase step; absent outside a native stack. */
  stackRebase?: string;
  recovery: QueueEjectionRecovery;
}

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

/** The trigger, stack route, and command guard; the fixed procedure lives in the playbook. */
export function buildQueueEjectionInstruction(input: QueueEjectionInput): string {
  const { stackRebase, recovery } = input;
  const route = stackRebase ? ` Stack update route: ${stackRebase}` : "";
  const guard =
    recovery === "none"
      ? "Shepherd printed no queue command for this session, so do not enqueue the PR."
      : `Run \`${recovery === "requeue" ? "requeue:" : "acknowledge queue removal:"}\` only if the failure does not reproduce and the head did not change.`;
  return `Triage the merge-queue ejection before any requeue.${route} ${guard} ${playbookPointer("Merge queue ejection")}`;
}
