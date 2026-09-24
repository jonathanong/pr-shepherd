import { readStackTopology, stackAncestryGaps } from "../../github/stack-read.mts";
import type { RepoInfo } from "../../github/client.mts";
import type { PollSummaryStackAncestry } from "../../types.mts";
import type { ShepherdReport } from "../../types/report.mts";

/**
 * A verified stale boundary for the PR being shepherded.
 *
 * The stack topology read is authoritative for this check: it compares the
 * child's recorded base OID with the current head OID of its immediate open
 * parent. GitHub can report both PRs CLEAN while this boundary is stale.
 */
export interface StaleNativeStackAncestry extends PollSummaryStackAncestry {
  instructions: string[];
}

/**
 * Find a stale immediate parent boundary for one PR.
 *
 * This helper is intentionally read-only. A null result means either the PR is
 * not a non-root native-stack layer, its boundary is current, or the boundary
 * could not be verified. Callers must not emit a repair command from an
 * unverified snapshot.
 */
export async function findStaleNativeStackAncestry(
  report: Pick<ShepherdReport, "pr" | "mergeStatus">,
  repo: RepoInfo,
): Promise<StaleNativeStackAncestry | null> {
  const stack = report.mergeStatus.mergeRequirements?.stack;
  if (!stack || stack.position <= 1) return null;

  try {
    const topology = await readStackTopology(report.pr, repo);
    const ancestry = stackAncestryGaps(topology.ordered).find((gap) => gap.childPr === report.pr);
    if (!ancestry) return null;
    return {
      ...ancestry,
      instructions: buildStaleNativeStackAncestryInstructions(repo, ancestry),
    };
  } catch {
    // A stale repair is safe only when both OIDs were observed together. Let
    // the caller retain the ordinary WAIT/ESCALATE path on an unreadable stack.
    return null;
  }
}

/** Build the one-PR repair guidance after a stale boundary was verified. */
function buildStaleNativeStackAncestryInstructions(
  repo: RepoInfo,
  ancestry: PollSummaryStackAncestry,
): string[] {
  return [
    `PR #${ancestry.childPr} records base \`${ancestry.childBaseRefName}\` at \`${ancestry.childBaseRefOid}\`, but its open parent PR #${ancestry.parentPr} currently ends at \`${ancestry.parentHeadRefName}\` \`${ancestry.parentHeadRefOid}\`.`,
    `From a clean checkout of \`${repo.owner}/${repo.name}\`, check out the parent stack branch \`${ancestry.parentHeadRefName}\`.`,
    "Run `gh stack rebase --upstack --no-trunk`, resolve any conflicts, and push the rewritten stack with `gh stack push`.",
  ];
}
