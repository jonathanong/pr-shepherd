/**
 * Whether a removed merge-queue commit still belongs to the current PR head.
 *
 * A merge-commit queue lists that head as a parent. Squash and rebase queues
 * build a one-parent commit on the base (or on the previous group commit), so
 * the PR head is not an ancestor. Missing parents are unverifiable: GitHub
 * keeps returning the latest removal after the synthetic commit is gone.
 * A one-parent removal is stale when the current head's committer time is
 * later than the removal, which is a push after the ejection.
 */
export function queueRemovalAppliesToHead(input: {
  parentOids: readonly string[] | null | undefined;
  headOid: string;
  headCommittedAtUnix?: number;
  removedAtUnix?: number;
}): boolean {
  const parents = input.parentOids ?? [];
  if (parents.length === 0) return false;
  if (parents.includes(input.headOid)) return true;
  if (parents.length > 1) return false;
  if (
    input.headCommittedAtUnix !== undefined &&
    input.removedAtUnix !== undefined &&
    input.removedAtUnix > 0 &&
    input.headCommittedAtUnix > input.removedAtUnix
  ) {
    return false;
  }
  return true;
}
