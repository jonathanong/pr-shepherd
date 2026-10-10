import type { MergedBasePullRequest } from "../types.mts";
import {
  readRestPages,
  restRepoPath,
  restObject,
  restString,
  restNumber,
  malformedRest,
} from "./rest-reader-core.mts";

export interface MergedBaseLookupInput {
  owner: string;
  repo: string;
  baseRefName: string;
  baseRefOid: string;
}

/** A reused branch name or a fork is insufficient evidence of a merged parent. */
export async function readRestMergedBasePullRequests(
  input: MergedBaseLookupInput,
): Promise<MergedBasePullRequest[]> {
  const repo = { owner: input.owner, name: input.repo };
  const head = encodeURIComponent(`${input.owner}:${input.baseRefName}`);
  const pulls = await readRestPages<unknown>(
    `${restRepoPath(repo)}/pulls?state=closed&head=${head}&sort=updated&direction=desc`,
  );
  const candidates: MergedBasePullRequest[] = [];
  const ids = new Set<number>();
  for (const value of pulls.nodes) {
    const pull = restObject(value, "closed pull request");
    const number = restNumber(pull.number, "closed pull number");
    if (number === 0 || ids.has(number)) malformedRest("closed pull number missing or repeated");
    ids.add(number);
    const state = restString(pull.state, "closed pull state");
    if (!["open", "closed"].includes(state)) malformedRest("closed pull state");
    if (pull.merged_at !== null && typeof pull.merged_at !== "string")
      malformedRest("closed pull merged_at");
    if (state !== "closed" || pull.merged_at === null) continue;
    if (!Number.isFinite(Date.parse(pull.merged_at as string)))
      malformedRest("closed pull merged_at");
    const source = restObject(pull.head, "closed pull head");
    const headRefName = restString(source.ref, "closed pull head ref");
    const headRefOid = restString(source.sha, "closed pull head SHA");
    if (headRefName !== input.baseRefName || headRefOid !== input.baseRefOid) continue;
    if (source.repo === null) continue;
    const headRepository = restObject(source.repo, "closed pull head repository");
    const nameWithOwner = restString(headRepository.full_name, "closed pull head repository name");
    if (nameWithOwner.toLowerCase() !== `${input.owner}/${input.repo}`.toLowerCase()) continue;
    const base = restObject(pull.base, "closed pull base");
    candidates.push({
      number,
      url: restString(pull.html_url, "closed pull URL"),
      state: "MERGED",
      headRefName,
      headRefOid,
      baseRefName: restString(base.ref, "closed pull base ref"),
      mergedAt: pull.merged_at as string,
      headRepository: { nameWithOwner },
    });
  }
  return candidates;
}
