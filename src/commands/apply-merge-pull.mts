import { readRest, restRepoPath } from "../github/rest-reader-core.mts";
import type { RestMergeResponse } from "../github/rest-merge.mts";

export interface PullState {
  state: string;
  merged: boolean;
  draft: boolean;
  head: { sha: string };
  merge_commit_sha?: string;
}

/**
 * Read the pull conditionally: inside the PR's conditional scope an unchanged pull answers a free
 * 304 whose stored body equals GitHub's current one.
 */
export function readPull(repo: { owner: string; name: string }, pr: number): Promise<PullState> {
  return readRest<PullState>("GET", `${restRepoPath(repo)}/pulls/${pr}`);
}

/** The merged outcome of a pull already merged, carrying its merge commit when GitHub reports one. */
export function mergedResponse(pull: PullState, message: string): RestMergeResponse {
  return {
    status: "merged",
    details: { message, ...(pull.merge_commit_sha && { sha: pull.merge_commit_sha }) },
  };
}
