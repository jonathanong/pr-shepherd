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
import { PR_NUMBER_BY_BRANCH_QUERY, GET_PR_HEAD_SHA_QUERY } from "./queries.mts";
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
  const result = await httpGraphql<{
    repository: { pullRequest: { headRefOid: string } | null } | null;
  }>(GET_PR_HEAD_SHA_QUERY, { owner, repo: name, pr });
  const sha = result.data.repository?.pullRequest?.headRefOid;
  if (!sha) throw new Error(`Could not resolve head SHA for PR #${pr}`);
  return sha;
}

export interface PrHeadInfo {
  sha: string;
  /** Branch name on the head repository. */
  ref: string;
  /** `"owner/name"` of the head repository — equals the base repo for same-repo PRs, differs for fork PRs. */
  repoWithOwner: string;
}

/**
 * Full head info for a PR — sha, branch name, and the head repository's full name.
 * Needed by commit-suggestions to target the correct branch via `createCommitOnBranch`.
 */
export async function getPrHead(pr: number, owner: string, name: string): Promise<PrHeadInfo> {
  const data = await rest<{
    head: { sha: string; ref: string; repo: { full_name: string } | null };
  }>("GET", `/repos/${owner}/${name}/pulls/${pr}`);
  if (!data.head.repo) {
    throw new Error(`PR #${pr} head repository is unavailable (fork may have been deleted).`);
  }
  return {
    sha: data.head.sha,
    ref: data.head.ref,
    repoWithOwner: data.head.repo.full_name,
  };
}

/**
 * Fetch a file's raw text content at a given ref. Uses the REST contents endpoint,
 * which returns base64 for files under 1MB. Throws for binary / oversize files.
 */
export async function getFileContents(
  repoWithOwner: string,
  path: string,
  ref: string,
): Promise<string> {
  const data = await rest<{ content?: string; encoding?: string; size?: number }>(
    "GET",
    `/repos/${repoWithOwner}/contents/${encodePathForApi(path)}?ref=${encodeURIComponent(ref)}`,
  );
  if (!data.content || data.encoding !== "base64") {
    throw new Error(`File ${path} could not be read as text (encoding=${data.encoding ?? "n/a"}).`);
  }
  return Buffer.from(data.content, "base64").toString("utf8");
}

// Encode every path segment but preserve the slashes between them.
function encodePathForApi(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
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

export async function getCurrentBranch(): Promise<string> {
  const { stdout } = await execFile("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  return stdout.trim();
}

function parseRemoteUrl(url: string): RepoInfo {
  const trimmed = url.trim();

  // ssh: git@host:owner/repo[.git]
  const sshMatch = /^git@[^:]+:([^/]+)\/([^/]+?)(?:\.git)?$/.exec(trimmed);
  if (sshMatch) {
    return { owner: sshMatch[1]!, name: sshMatch[2]! };
  }

  // https or ssh://: parse via URL and require exactly /<owner>/<repo>[.git]
  if (/^(?:https?|ssh):\/\//.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const pathname = parsed.pathname.replace(/\.git\/?$/, "").replace(/\/$/, "");
      const parts = pathname.split("/").filter(Boolean);
      if (parts.length === 2) {
        return { owner: parts[0]!, name: parts[1]! };
      }
    } catch {
      // fall through to error
    }
  }

  throw new Error(`Cannot parse GitHub remote URL: ${url}`);
}
