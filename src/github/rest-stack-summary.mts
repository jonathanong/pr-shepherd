import { readRest, restRepoPath, restObject } from "./rest-reader-core.mts";
import { readRestViewerLogin } from "./rest-viewer-read.mts";
import { readAllowedMergeMethods } from "../config/merge-method.mts";
import type { RepoInfo } from "./client.mts";
import { readRestStackMembership } from "./rest-stack-read.mts";
import { fetchRestRawSummaryPr } from "./rest-batch-read.mts";
import { mapPool } from "../util/pool.mts";
import { EXIT, ShepherdError } from "../exit-codes.mts";
import { GitHubRequestError } from "./errors.mts";
import { readRestPull, restPullRevision } from "./rest-pr-core.mts";
import { readRestBranchRules } from "./rest-rules-read.mts";
import type { RestSnapshotContext } from "./rest-snapshot-context.mts";

export async function readRestStackSummary(anchor: number, repo: RepoInfo) {
  const stack = await readRestStackMembership(anchor, repo);
  if (!stack)
    throw new ShepherdError(`PR #${anchor} is not part of a native GitHub stack`, EXIT.UNAVAILABLE);
  const settings = restObject(
    await readRest<unknown>("GET", restRepoPath(repo)),
    "repository merge settings",
  );
  const viewerLogin = await readRestViewerLogin();
  const branchRules = new Map<string, ReturnType<typeof readRestBranchRules>>();
  const pullRevisions = new Map<number, string>();
  const context: RestSnapshotContext = {
    stack,
    repository: settings,
    viewerLogin,
    readBranchRules(branch) {
      let rules = branchRules.get(branch);
      if (!rules) {
        rules = readRestBranchRules(repo, branch);
        branchRules.set(branch, rules);
      }
      return rules;
    },
    recordPullRevision(pr, revision) {
      pullRevisions.set(pr, revision);
    },
  };
  const ordered = await mapPool(stack.pull_requests, 4, (member) =>
    fetchRestRawSummaryPr(member.number, repo, context),
  );
  await mapPool(ordered, 4, async (member) => {
    const latest = await readRestPull(member.number, repo);
    if (restPullRevision(latest) !== pullRevisions.get(member.number)) stackChanged();
  });
  const fresh = await readRestStackMembership(anchor, repo);
  if (!fresh || JSON.stringify(fresh) !== JSON.stringify(stack)) stackChanged();
  const allowedMergeMethods = readAllowedMergeMethods({
    mergeCommitAllowed:
      typeof settings.allow_merge_commit === "boolean" ? settings.allow_merge_commit : undefined,
    squashMergeAllowed:
      typeof settings.allow_squash_merge === "boolean" ? settings.allow_squash_merge : undefined,
    rebaseMergeAllowed:
      typeof settings.allow_rebase_merge === "boolean" ? settings.allow_rebase_merge : undefined,
  });
  return {
    stackNumber: stack.number,
    stackSize: ordered.length,
    viewerLogin,
    ordered,
    ...(allowedMergeMethods && { allowedMergeMethods }),
  };
}

function stackChanged(): never {
  throw new GitHubRequestError("Native stack changed during REST summary read; retry", {
    status: 409,
    exitCodeOverride: EXIT.TEMPFAIL,
  });
}
