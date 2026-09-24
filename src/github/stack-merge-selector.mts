import type { StackMergeSelector } from "../types.mts";
import { GitHubRequestError } from "./errors.mts";
import { rest } from "./http.mts";

/**
 * Whether `gh stack merge <pr>` would select PR `pr` rather than a native stack
 * with the same number. GraphQL has no stack-by-number lookup, so this reads
 * REST `GET /repos/{owner}/{repo}/stacks/{number}`; a lookup failure is
 * reported rather than thrown so an `--until-terminal` session keeps polling.
 */
export async function checkStackMergeSelector(
  pr: number,
  repo: { owner: string; name: string },
): Promise<StackMergeSelector> {
  try {
    await rest("GET", `/repos/${repo.owner}/${repo.name}/stacks/${pr}`);
    return { status: "stack-number" };
  } catch (error) {
    if (error instanceof GitHubRequestError && error.status === 404) return { status: "verified" };
    return { status: "unverified", error: error instanceof Error ? error.message : String(error) };
  }
}
