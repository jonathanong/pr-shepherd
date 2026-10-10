import { readRest, restRepoPath, restObject } from "./rest-reader-core.mts";
import { readAllowedMergeMethods } from "../config/merge-method.mts";
import type { RepoInfo } from "./client.mts";
import { readRestStackTopology } from "./rest-stack-read.mts";
import { fetchRestRawSummaryPr } from "./rest-batch-read.mts";
import { mapPool } from "../util/pool.mts";
import { ShepherdError, EXIT } from "../exit-codes.mts";

export async function readRestStackSummary(anchor: number, repo: RepoInfo) {
  const topology = await readRestStackTopology(anchor, repo);
  const ordered = await mapPool(topology.ordered, 4, (member) =>
    fetchRestRawSummaryPr(member.number, repo),
  );
  const fresh = await readRestStackTopology(anchor, repo);
  if (JSON.stringify(fresh.ordered) !== JSON.stringify(topology.ordered)) {
    throw new ShepherdError("Native stack changed during REST summary read; retry", EXIT.TEMPFAIL);
  }
  const settings = restObject(
    await readRest<unknown>("GET", restRepoPath(repo)),
    "repository merge settings",
  );
  const allowedMergeMethods = readAllowedMergeMethods({
    mergeCommitAllowed:
      typeof settings.allow_merge_commit === "boolean" ? settings.allow_merge_commit : undefined,
    squashMergeAllowed:
      typeof settings.allow_squash_merge === "boolean" ? settings.allow_squash_merge : undefined,
    rebaseMergeAllowed:
      typeof settings.allow_rebase_merge === "boolean" ? settings.allow_rebase_merge : undefined,
  });
  return { ...topology, ordered, ...(allowedMergeMethods && { allowedMergeMethods }) };
}
