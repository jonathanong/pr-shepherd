/**
 * High-level GitHub client — wraps http.mts for application-level concerns.
 *
 * All GitHub I/O goes through native fetch (via http.mts); the `gh` CLI is no
 * longer used for GitHub API calls, but may be invoked as an auth-token
 * fallback via `gh auth token` when neither GH_TOKEN nor GITHUB_TOKEN is set.
 */

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { graphql as httpGraphql, rest, type RateLimitInfo, type GraphQlResult } from "./http.mts";
import { PR_NUMBER_BY_BRANCH_QUERY } from "./queries.mts";
import type { MergeableState, MergeStateStatus } from "../types.mts";

export type { RateLimitInfo, GraphQlResult };

const execFile = promisify(execFileCb);

// ---------------------------------------------------------------------------
// GraphQL — thin re-exports so callers don't need to import http.mts directly
// ---------------------------------------------------------------------------

export { graphql, graphqlWithRateLimit } from "./http.mts";

// ---------------------------------------------------------------------------
// Repo / PR lookup helpers
// ---------------------------------------------------------------------------

export interface RepoInfo {
  owner: string;
  name: string;
}

/**
 * Returns the current repo's owner and name by parsing `git remote get-url origin`.
 * Handles https://, git@, and ssh:// remote URL formats.
 */
export async function getRepoInfo(): Promise<RepoInfo> {
  const { stdout } = await execFile("git", ["remote", "get-url", "origin"]);
  const url = stdout.trim();
  return parseRemoteUrl(url);
}

/**
 * Derives the PR number for the current HEAD branch.
 * Returns null if no open PR is found.
 */
export async function getCurrentPrNumber(): Promise<number | null> {
  try {
    const branch = await getCurrentBranch();
    if (branch === "HEAD") return null;
    const repo = await getRepoInfo();
    const result = await httpGraphql<{
      repository: { pullRequests: { nodes: Array<{ number: number }> } } | null;
    }>(PR_NUMBER_BY_BRANCH_QUERY, { owner: repo.owner, repo: repo.name, branch });
    return result.data.repository?.pullRequests.nodes[0]?.number ?? null;
  } catch {
    return null;
  }
}

/** Returns the `headRefOid` (commit SHA) of the given PR as reported by GitHub. */
export async function getPrHeadSha(pr: number, owner: string, name: string): Promise<string> {
  const data = await rest<{ head: { sha: string } }>("GET", `/repos/${owner}/${name}/pulls/${pr}`);
  return data.head.sha;
}

/**
 * Fetches `mergeable` and `mergeStateStatus` via the REST API.
 *
 * Used as a fallback when the GraphQL API returns `UNKNOWN` for these fields —
 * a known GitHub quirk where GraphQL lags behind the REST layer.
 */
export async function getMergeableState(
  pr: number,
  owner: string,
  repo: string,
): Promise<{ mergeable: MergeableState; mergeStateStatus: MergeStateStatus }> {
  const data = await rest<{ mergeable: boolean | null; mergeable_state: string }>(
    "GET",
    `/repos/${owner}/${repo}/pulls/${pr}`,
  );

  const mergeable: MergeableState =
    data.mergeable === true ? "MERGEABLE" : data.mergeable === false ? "CONFLICTING" : "UNKNOWN";

  const mergeStateStatus = data.mergeable_state.toUpperCase() as MergeStateStatus;

  return { mergeable, mergeStateStatus };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function getCurrentBranch(): Promise<string> {
  const { stdout } = await execFile("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  return stdout.trim();
}

function parseRemoteUrl(url: string): RepoInfo {
  // Strip trailing .git and trailing slash
  const stripped = url.replace(/\.git$/, "").replace(/\/$/, "");

  // ssh: git@host:owner/repo
  const sshMatch = /^git@[^:]+:([^/]+)\/(.+)$/.exec(stripped);
  if (sshMatch) {
    return { owner: sshMatch[1]!, name: sshMatch[2]! };
  }

  // https or ssh://: https://host/owner/repo  or  ssh://git@host/owner/repo
  const httpsMatch = /^(?:https?|ssh):\/\/[^/]+\/([^/]+)\/(.+)$/.exec(stripped);
  if (httpsMatch) {
    return { owner: httpsMatch[1]!, name: httpsMatch[2]! };
  }

  throw new Error(`Cannot parse GitHub remote URL: ${url}`);
}
