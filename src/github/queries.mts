/**
 * GraphQL query strings used by pr-shepherd.
 *
 * Query strings live in src/github/gql/*.gql.
 * Never inline raw GraphQL strings in .ts source files.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const gql = (name: string): string =>
  readFileSync(join((import.meta as { dirname: string }).dirname, "gql", name), "utf8");

/** The primary batch query that fetches CI + comments + merge status in one round-trip. */
export const BATCH_PR_QUERY = gql("batch-pr.gql");

/** Resolve a single review thread. */
export const RESOLVE_THREAD_MUTATION = gql("resolve-thread.gql");

/** Minimize a PR comment (IssueComment). */
export const MINIMIZE_COMMENT_MUTATION = gql("minimize-comment.gql");

/** Dismiss a pull request review. */
export const DISMISS_REVIEW_MUTATION = gql("dismiss-review.gql");

/** Multi-PR status query for `shepherd status PR1 PR2 …`. */
export const MULTI_PR_STATUS_QUERY = gql("multi-pr-status.gql");

/** Paginated version — used when reviewThreads is truncated (totalCount > 100). */
export const MULTI_PR_STATUS_QUERY_WITH_CURSOR = gql("multi-pr-status-paged.gql");
