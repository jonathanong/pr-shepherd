import { EXIT, ShepherdError } from "../exit-codes.mts";
import type { RepoInfo } from "../github/client.mts";
import { readRestStackMembership, readRestStackTopology } from "../github/rest-stack-read.mts";
import { fetchRawSummaryPr } from "../github/poll-summary.mts";
import { summarizePollSummaryPr } from "../github/poll-summary-projector.mts";
import { stackAncestryGaps } from "../github/stack-read.mts";
import { mapPool } from "../util/pool.mts";

/** Validate the exact current native prefix before requesting a stack merge. */
export async function validateRestStackMergeReadiness(
  pr: number,
  repo: RepoInfo,
  sha: string,
): Promise<void> {
  if (!(await readRestStackMembership(pr, repo))) return;
  const topology = await readRestStackTopology(pr, repo);
  const index = topology.ordered.findIndex((member) => member.number === pr);
  if (index < 0 || topology.ordered[index]?.headRefOid !== sha)
    fail("Stack head changed before merge");
  const prefix = topology.ordered.slice(0, index + 1);
  if (prefix.some((member) => !["OPEN", "MERGED"].includes(member.state)))
    fail("Stack prefix has a closed or unverified dependency");
  const open = prefix.filter((member) => member.state === "OPEN");
  const membership = await readRestStackMembership(pr, repo);
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
  if (JSON.stringify(latest.ordered) !== JSON.stringify(topology.ordered))
    fail("Native stack changed while validating merge readiness");
}

function fail(message: string): never {
  throw new ShepherdError(
    `${message}; rerun the --stack --merge selector before applying this request`,
    EXIT.UNAVAILABLE,
  );
}
