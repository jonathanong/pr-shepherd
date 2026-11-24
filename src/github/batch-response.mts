import { EXIT, ShepherdError } from "../exit-codes.mts";
import type { RepoInfo } from "./client.mts";
import { GitHubRequestError } from "./errors.mts";
import { dropNullNodes } from "./null-nodes.mts";
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
  if (!response.repository.pullRequest) {
    throw new ShepherdError(`PR #${pr} not found`, EXIT.UNAVAILABLE);
  }
  const raw = response.repository.pullRequest;
  raw.unreadNodes = dropNullNodes(raw);
  const receipt = response.repository.receiptSummary;
  if (receipt) receipt.unreadNodes = dropNullNodes(receipt);
  return raw;
}

/** The context nodes of a page that `dropNullNodes` already cleaned. */
export function contextNodes(nodes: Array<RawContextNode | null>): RawContextNode[] {
  return nodes.filter((node): node is RawContextNode => node !== null);
}
