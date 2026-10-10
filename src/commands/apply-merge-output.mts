import type { RepoInfo } from "../github/client.mts";
import type { RestMergeOptions, RestMergeResponse } from "../github/rest-merge.mts";
import type { ApplyMergeResult } from "./apply-merge.mts";

export function mergeResultFactory(pr: number, repo: RepoInfo, options: RestMergeOptions) {
  const failed = (message: string, uncertain?: true): ApplyMergeResult => ({
    pr,
    repo: `${repo.owner}/${repo.name}`,
    status: "failed",
    details: {
      message,
      expected_head_sha: options.requireSha,
      merge_action: options.mergeAction,
      ...(options.mergeMethod && { merge_method: options.mergeMethod }),
    },
    ...(uncertain && { uncertain }),
  });
  const project = (response: RestMergeResponse): ApplyMergeResult => ({
    pr,
    repo: `${repo.owner}/${repo.name}`,
    ...response,
  });
  return { failed, project };
}
