import { EXIT, ShepherdError } from "../exit-codes.mts";
import type { RepoInfo } from "../github/client.mts";
import { readRestStackMembership, readRestStackTopology } from "../github/rest-stack-read.mts";
import { fetchRawSummaryPr } from "../github/poll-summary.mts";
import { summarizePollSummaryPr } from "../github/poll-summary-projector.mts";
import { stackAncestryGaps } from "../github/stack-read.mts";
import { mapPool } from "../util/pool.mts";
import {
  restMergeStackGuardKey,
  type RestMergeStackGuard,
} from "../github/rest-merge-stack-guard.mts";
import type { StackMemberRefs } from "../github/stack-read.mts";

/** Validate the exact current native prefix before requesting a stack merge. */
export async function validateRestStackMergeReadiness(
  pr: number,
  repo: RepoInfo,
  sha: string,
  expectedStack?: RestMergeStackGuard,
): Promise<void> {
  const initialMembership = await readRestStackMembership(pr, repo);
  if (!initialMembership) {
    if (expectedStack) fail("Expected native stack is no longer present");
    return;
  }
  if (
    expectedStack &&
    (initialMembership.number !== expectedStack.number ||
      initialMembership.base.ref !== expectedStack.baseRefName)
  )
    fail("Expected native stack identity or trunk changed");
  const topology = await readRestStackTopology(pr, repo);
  const index = topology.ordered.findIndex((member) => member.number === pr);
  if (index < 0 || topology.ordered[index]?.headRefOid !== sha)
    fail("Stack head changed before merge");
  const prefix = topology.ordered.slice(0, index + 1);
  if (
    expectedStack &&
    restMergeStackGuardKey(expectedStack) !==
      restMergeStackGuardKey({
        number: topology.stackNumber,
        baseRefName: initialMembership.base.ref,
        prefix: prefix.map(guardMember),
      })
  )
    fail("Expected native stack prefix or parent boundaries changed");
  if (prefix.some((member) => !["OPEN", "MERGED"].includes(member.state)))
    fail("Stack prefix has a closed or unverified dependency");
  const open = prefix.filter((member) => member.state === "OPEN");
  const membership = await readRestStackMembership(pr, repo);
  if (
    membership &&
    (membership.number !== initialMembership.number ||
      membership.base.ref !== initialMembership.base.ref)
  )
    fail("Native stack identity or trunk changed while validating merge readiness");
  if (!membership || open[0]?.baseRefName !== membership.base.ref)
    fail("Bottom open stack layer does not target the trunk");
  if (stackAncestryGaps(prefix).length > 0) fail("Stack prefix has stale parent boundaries");
  await mapPool(open, 4, async (member) => {
    const raw = await fetchRawSummaryPr(member.number, repo);
    const summary = await summarizePollSummaryPr(raw, repo, { stackPrNumber: pr });
    if (
      raw.headRefOid !== member.headRefOid ||
      raw.baseRefOid !== member.baseRefOid ||
      summary.readyReceipt !== true
    )
      fail(`PR #${member.number} has no current Shepherd READY receipt`);
  });
  const latest = await readRestStackTopology(pr, repo);
  const finalMembership = await readRestStackMembership(pr, repo);
  if (
    !finalMembership ||
    finalMembership.number !== initialMembership.number ||
    finalMembership.base.ref !== initialMembership.base.ref ||
    JSON.stringify(finalMembership.pull_requests.map((member) => member.number)) !==
      JSON.stringify(latest.ordered.map((member) => member.number)) ||
    latest.stackNumber !== topology.stackNumber ||
    JSON.stringify(latest.ordered) !== JSON.stringify(topology.ordered)
  )
    fail("Native stack changed while validating merge readiness");
}

function guardMember(member: StackMemberRefs) {
  return {
    pr: member.number,
    headRefName: member.headRefName,
    headRefOid: member.headRefOid,
    baseRefName: member.baseRefName,
  };
}

function fail(message: string): never {
  throw new ShepherdError(
    `${message}; rerun the --stack --merge selector before applying this request`,
    EXIT.UNAVAILABLE,
  );
}
