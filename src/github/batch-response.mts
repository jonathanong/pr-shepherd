import type { RepoInfo } from "./client.mts";
import { GitHubRequestError } from "./errors.mts";
import type { RawBatchResponse, RawContextNode, RawPr } from "./batch-raw-types.mts";

export function requireRawPr(
  response: RawBatchResponse | null | undefined,
  pr: number,
  repo: RepoInfo,
): RawPr {
  if (!response?.repository) {
    throw new GitHubRequestError(
      `GitHub GraphQL response did not include repository ${repo.owner}/${repo.name} (not found or access denied)`,
      { status: 200 },
    );
  }
  if (!response.repository.pullRequest) throw new Error(`PR #${pr} not found`);
  return response.repository.pullRequest;
}

export function requireContextNodes(nodes: Array<RawContextNode | null>): RawContextNode[] {
  const nullIndex = nodes.findIndex((node) => node === null);
  if (nullIndex !== -1) {
    throw new GitHubRequestError(
      `Malformed GitHub GraphQL response: null check context at repository.pullRequest.commits.nodes.0.commit.statusCheckRollup.contexts.nodes.${nullIndex}`,
      { status: 200 },
    );
  }
  return nodes as RawContextNode[];
}
