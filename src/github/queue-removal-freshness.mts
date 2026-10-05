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
 * stale once this head reached the PR after the removal (see `headArrivalUnix`).
 */
export function queueRemovalAppliesToHead(
  input: HeadTimes & {
    parentOids: readonly string[] | null | undefined;
    headOid: string;
    removedAtUnix?: number;
  },
): boolean {
  const parents = input.parentOids ?? [];
  if (parents.length === 0) return false;
  if (parents.includes(input.headOid)) return true;
  if (parents.length > 1) return false;
  const removedAt = input.removedAtUnix;
  if (removedAt === undefined || removedAt <= 0) return true;
  const arrivedAt = headArrivalUnix(input);
  return arrivedAt === undefined || arrivedAt <= removedAt;
}

type HeadTimes = {
  headCommittedAtUnix?: number | null;
  headPushedAtUnix?: number;
  headForcePushedAtUnix?: number;
};

/**
 * When the current head reached the PR. The earliest pull_request check on the
 * head is its push time, but it can come from an earlier tenure of a commit
 * that was later force-pushed back, so the latest force-push wins when it is
 * later. Without a check time, the committer time is the fallback, again
 * superseded by a later force-push. A committer clock that runs ahead only
 * matters in that fallback.
 */
export function headArrivalUnix(input: HeadTimes): number | undefined {
  const pushedAt = positive(input.headPushedAtUnix) ?? positive(input.headCommittedAtUnix);
  const forcePushedAt = positive(input.headForcePushedAtUnix);
  if (pushedAt === undefined) return forcePushedAt;
  return forcePushedAt === undefined ? pushedAt : Math.max(pushedAt, forcePushedAt);
}

function positive(value: number | null | undefined): number | undefined {
  return value !== undefined && value !== null && value > 0 ? value : undefined;
}

/** Latest head-ref force-push time from a `headRefForcePushes` timeline field. */
export function forcePushUnix(
  field: { nodes: Array<{ createdAt: string }> } | null | undefined,
): number | undefined {
  const raw = field?.nodes[0]?.createdAt;
  return raw ? positive(parseCreatedAt(raw)) : undefined;
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
