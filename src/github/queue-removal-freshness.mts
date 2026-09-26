import { parseCreatedAt } from "./batch-parser-helpers.mts";

const PULL_REQUEST_EVENTS = new Set(["pull_request", "pull_request_target"]);

type PushCheckNode = {
  __typename?: string;
  checkSuite?: {
    createdAt?: string | null;
    workflowRun?: { event?: string | null; createdAt?: string | null } | null;
  } | null;
};

/**
 * Whether a removed merge-queue commit still belongs to the current PR head.
 *
 * A merge-commit queue lists that head as a parent. Squash and rebase queues
 * build a one-parent commit on the base, so parent identity cannot show a
 * later push. Missing parents are unverifiable: GitHub keeps returning the
 * latest removal after the synthetic commit is gone. A one-parent removal is
 * stale once this head reached the PR after the removal. That time is the
 * earliest pull_request check on the head, with the head's committer time as
 * the fallback when no check time is available.
 */
export function queueRemovalAppliesToHead(input: {
  parentOids: readonly string[] | null | undefined;
  headOid: string;
  headCommittedAtUnix?: number;
  headPushedAtUnix?: number;
  removedAtUnix?: number;
}): boolean {
  const parents = input.parentOids ?? [];
  if (parents.length === 0) return false;
  if (parents.includes(input.headOid)) return true;
  if (parents.length > 1) return false;
  const removedAt = input.removedAtUnix;
  if (removedAt === undefined || removedAt <= 0) return true;
  const pushedAt = input.headPushedAtUnix;
  if (pushedAt !== undefined && pushedAt > 0) return pushedAt <= removedAt;
  const committedAt = input.headCommittedAtUnix;
  if (committedAt !== undefined && committedAt > removedAt) return false;
  return true;
}

/** Earliest pull_request check-suite time on the head commit, when one exists. */
export function headPushUnixFromCheckNodes(
  nodes: readonly (PushCheckNode | null)[] | null | undefined,
): number | undefined {
  let earliest: number | undefined;
  for (const node of nodes ?? []) {
    if (node?.__typename !== "CheckRun") continue;
    const run = node.checkSuite?.workflowRun;
    const event = run?.event;
    if (event == null || !PULL_REQUEST_EVENTS.has(event)) continue;
    const raw = node.checkSuite?.createdAt || run?.createdAt;
    if (!raw) continue;
    const at = parseCreatedAt(raw);
    if (at <= 0) continue;
    if (earliest === undefined || at < earliest) earliest = at;
  }
  return earliest;
}
