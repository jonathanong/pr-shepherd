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

/** Returns the current head commit SHA for a PR. Used by waitForSha polling. */
export const GET_PR_HEAD_SHA_QUERY = gql("get-pr-head-sha.gql");

/** Multi-PR status query for `shepherd status PR1 PR2 …`. */
export const MULTI_PR_STATUS_QUERY = gql("multi-pr-status.gql");

/** Paginated version — used when reviewThreads is truncated (totalCount > 100). */
export const MULTI_PR_STATUS_QUERY_WITH_CURSOR = gql("multi-pr-status-paged.gql");

/** Look up PR number by branch name (for getCurrentPrNumber). */
export const PR_NUMBER_BY_BRANCH_QUERY = gql("pr-number-by-branch.gql");

/** Convert a draft PR to ready for review. */
export const MARK_PR_READY_MUTATION = gql("mark-pr-ready.gql");
