import { graphql } from "../../github/client.mts";
import { MERGED_BASE_PULL_REQUESTS_QUERY } from "../../github/queries.mts";
import { pollRateLimitRetryAfterMs } from "../poll-quota.mts";
import type { MergedBasePullRequest } from "../../types.mts";
import { githubOperation, isGithubReadFallbackError } from "../../github/transport.mts";
import {
  readRestMergedBasePullRequests,
  type MergedBaseLookupInput,
} from "../../github/rest-merged-base-read.mts";

interface Response {
  repository: {
    pullRequests: { nodes: Array<MergedBasePullRequest | null> };
  } | null;
}

/** A bounded, best-effort lookup; matching OIDs and repository prevent branch-name reuse false positives. */
export async function lookupMergedBasePullRequests(
  input: MergedBaseLookupInput,
): Promise<MergedBasePullRequest[]> {
  try {
    return await githubOperation(
      "MergedBasePullRequests",
      async () => {
        const { data } = await graphql<Response>(MERGED_BASE_PULL_REQUESTS_QUERY, {
          owner: input.owner,
          repo: input.repo,
          branch: input.baseRefName,
        });
        return (data.repository?.pullRequests.nodes ?? []).filter(
          (candidate): candidate is MergedBasePullRequest =>
            candidate !== null &&
            candidate.state === "MERGED" &&
            candidate.headRefName === input.baseRefName &&
            candidate.headRefOid === input.baseRefOid &&
            candidate.headRepository?.nameWithOwner === `${input.owner}/${input.repo}`,
        );
      },
      () => readRestMergedBasePullRequests(input),
    );
  } catch (error) {
    if (pollRateLimitRetryAfterMs(error) !== null || isGithubReadFallbackError(error)) throw error;
    process.stderr.write(
      `pr-shepherd: merged-base PR lookup unavailable (ignored): ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return [];
  }
}
