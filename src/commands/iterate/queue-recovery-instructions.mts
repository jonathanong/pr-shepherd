/** Instruction text for a PR that GitHub removed from the merge queue after failed checks. */

import type { AgentCheck, ShepherdReport } from "../../types.mts";
import { playbookPointer } from "../playbook-pointer.mts";
import { getGithubTransport } from "../../github/transport.mts";

/** Which recovery command, if any, Shepherd printed for a failure that does not reproduce. */
export type QueueEjectionRecovery = "requeue" | "acknowledge" | "none";

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
  const route = stackRebase && routePrinted ? "use the stack route printed above." : stackRebase;
  return [buildQueueEjectionInstruction(recovery, route)];
}

/**
 * The trigger, update route, and command guard; the fixed procedure lives in the playbook.
 * A printed command implies a `failed_checks` removal. Without one, the agent reads the raw
 * removal reason, since a person's dequeue must not be undone by a branch update.
 */
function buildQueueEjectionInstruction(
  recovery: QueueEjectionRecovery,
  stackRoute?: string,
): string {
  const target = stackRoute ? "the stack" : "the PR head";
  const route = stackRoute ? `: ${stackRoute}` : ".";
  const update =
    recovery === "none"
      ? `If the \`**queue removal**\` reason shows GitHub removed the entry itself, update ${target} from the latest base first${route} If a person may have dequeued the PR, skip that update unless a conflict step above requires it.`
      : `Update ${target} from the latest base first${route}`;
  const reproduce =
    "only if the failure does not reproduce on the updated head, neither the update nor a code change altered the head, and no other blocker remains.";
  const guard =
    recovery === "requeue"
      ? `Run \`requeue:\` ${reproduce}${getGithubTransport() === "rest" ? " If pending, resume the same REST command; enqueued is not merged." : " If gh reports auto-merge is disabled, run `requeue API fallback:` instead."}`
      : recovery === "acknowledge"
        ? `Run \`acknowledge queue removal:\` ${reproduce}`
        : "Shepherd printed no queue command for this session, so do not enqueue the PR.";
  return `Triage the merge-queue ejection before any requeue. ${update} ${guard} ${playbookPointer("Merge queue ejection")}`;
}
