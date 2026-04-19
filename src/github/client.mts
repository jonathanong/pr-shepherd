/**
 * Thin wrapper around the `gh` CLI for GraphQL and REST calls.
 */

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import type { MergeableState, MergeStateStatus } from "../types.mts";
import { loadConfig } from "../config/load.mts";

const execFile = promisify(execFileCb);

export interface RateLimitInfo {
  remaining: number;
  limit: number;
  resetAt: number;
}

export interface GraphQlResult<T = unknown> {
  data: T;
  rateLimit?: RateLimitInfo;
}

// ---------------------------------------------------------------------------
// GraphQL
// ---------------------------------------------------------------------------

/**
 * Execute a GraphQL query via `gh api graphql`.
 *
 * @param query   The full GraphQL query/mutation string.
 * @param vars    Key-value pairs forwarded as `-f key=value` or `-F key=value`.
 *                Numeric values are passed with `-F`; everything else with `-f`.
 */
export async function graphql<T = unknown>(
  query: string,
  vars: Record<string, string | number | boolean> = {},
): Promise<GraphQlResult<T>> {
  const args = buildGraphqlArgs(query, vars);
  const raw = await runGh(args);
  const parsed = JSON.parse(raw) as { data: T; errors?: Array<{ message: string }> };

  if (parsed.errors?.length) {
    const messages = parsed.errors.map((e) => e.message).join("; ");
    throw new Error(`GitHub GraphQL error: ${messages}`);
  }

  return { data: parsed.data };
}

/** Like {@link graphql} but also returns the `x-ratelimit-remaining` header. */
export async function graphqlWithRateLimit<T = unknown>(
  query: string,
  vars: Record<string, string | number | boolean> = {},
): Promise<GraphQlResult<T>> {
  // --include must come after 'api' (it's a flag for `gh api`, not for `gh`).
  const [api, ...extraArgs] = buildGraphqlArgs(query, vars);
  const args = [api!, "--include", ...extraArgs];
  const raw = await runGh(args);

  // `gh api -i` prepends HTTP headers before the JSON body.
  // Handle both CRLF (\r\n\r\n) and LF-only (\n\n) header separators.
  const crlfEnd = raw.indexOf("\r\n\r\n");
  const lfEnd = raw.indexOf("\n\n");
  const headerEnd = crlfEnd >= 0 ? crlfEnd : lfEnd;
  const headerSection = headerEnd >= 0 ? raw.slice(0, headerEnd) : "";
  const body = headerEnd >= 0 ? raw.slice(headerEnd + (crlfEnd >= 0 ? 4 : 2)) : raw;

  const remaining = parseHeaderNumber(headerSection, "x-ratelimit-remaining");
  const limit = parseHeaderNumber(headerSection, "x-ratelimit-limit");
  const resetAt = parseHeaderNumber(headerSection, "x-ratelimit-reset");

  const parsed = JSON.parse(body) as { data: T; errors?: Array<{ message: string }> };

  if (parsed.errors?.length) {
    const messages = parsed.errors.map((e) => e.message).join("; ");
    throw new Error(`GitHub GraphQL error: ${messages}`);
  }

  return {
    data: parsed.data,
    rateLimit:
      remaining !== null && limit !== null && resetAt !== null
        ? { remaining, limit, resetAt }
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// Repo / PR lookup helpers
// ---------------------------------------------------------------------------

export interface RepoInfo {
  owner: string;
  name: string;
}

/** Returns the current repo's owner and name from `gh repo view`. */
export async function getRepoInfo(): Promise<RepoInfo> {
  const raw = await runGh(["repo", "view", "--json", "owner,name"]);
  const parsed = JSON.parse(raw) as { owner: { login: string }; name: string };
  return { owner: parsed.owner.login, name: parsed.name };
}

/**
 * Derives the PR number for the current HEAD branch.
 * Returns null if no open PR is found.
 */
export async function getCurrentPrNumber(): Promise<number | null> {
  try {
    const branch = await getCurrentBranch();
    // In detached HEAD state git returns "HEAD" — no branch name to look up.
    if (branch === "HEAD") return null;
    const raw = await runGh([
      "pr",
      "list",
      "--head",
      branch,
      "--json",
      "number",
      "--jq",
      ".[0].number",
    ]);
    const trimmed = raw.trim();
    if (!trimmed || trimmed === "null") return null;
    return parseInt(trimmed, 10);
  } catch {
    return null;
  }
}

async function getCurrentBranch(): Promise<string> {
  await runGh(["--version"]); // warm up gh CLI before git call
  // Use git directly for branch name — gh doesn't expose it.
  const { stdout } = await execFile("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  return stdout.trim();
}

/** Returns the `headRefOid` (commit SHA) of the given PR as reported by GitHub. */
export async function getPrHeadSha(pr: number, owner: string, name: string): Promise<string> {
  const raw = await runGh(["api", `repos/${owner}/${name}/pulls/${pr}`, "--jq", ".head.sha"]);
  return raw.trim();
}

/**
 * Fetches `mergeable` and `mergeStateStatus` via the REST API (`gh pr view`).
 *
 * Used as a fallback when the GraphQL API returns `UNKNOWN` for these fields —
 * a known GitHub quirk where GraphQL lags behind the REST layer.
 */
export async function getMergeableState(
  pr: number,
  owner: string,
  repo: string,
): Promise<{ mergeable: MergeableState; mergeStateStatus: MergeStateStatus }> {
  const raw = await runGh([
    "pr",
    "view",
    String(pr),
    "--repo",
    `${owner}/${repo}`,
    "--json",
    "mergeable,mergeStateStatus",
  ]);
  const parsed = JSON.parse(raw) as {
    mergeable: MergeableState;
    mergeStateStatus: MergeStateStatus;
  };
  return parsed;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildGraphqlArgs(
  query: string,
  vars: Record<string, string | number | boolean>,
): string[] {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [k, v] of Object.entries(vars)) {
    if (typeof v === "number" || typeof v === "boolean") {
      args.push("-F", `${k}=${String(v)}`);
    } else {
      args.push("-f", `${k}=${v}`);
    }
  }
  return args;
}

async function runGh(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFile("gh", args, {
      maxBuffer: loadConfig().execution.maxBufferMb * 1024 * 1024,
    });
    return stdout;
  } catch (err) {
    // Re-throw with a more useful message
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`gh ${args[0] ?? ""} failed: ${msg}`, { cause: err });
  }
}

function parseHeaderNumber(headers: string, name: string): number | null {
  const re = new RegExp(`^${name}:\\s*(\\d+)`, "im");
  const m = re.exec(headers);
  return m ? parseInt(m[1]!, 10) : null;
}
