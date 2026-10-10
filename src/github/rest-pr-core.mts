import { readRest as rest } from "./rest-reader-core.mts";
import type { RepoInfo } from "./client.mts";
import {
  restRepoPath,
  restObject,
  restString,
  restNumber,
  restBoolean,
  restArray,
  malformedRest,
} from "./rest-reader-core.mts";
import { recordRestIdentity } from "./rest-identities.mts";

export interface RestPull {
  id: number;
  node_id: string;
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: string;
  merged_at: string | null;
  draft: boolean;
  mergeable: boolean | null;
  mergeable_state: string;
  updated_at: string;
  user: { login: string; type?: string } | null;
  head: { ref: string; sha: string; repo: { full_name: string } | null };
  base: { ref: string; sha: string };
  requested_reviewers: Array<{ login: string }>;
  requested_teams: Array<{ name: string }>;
  auto_merge?: { enabled_by?: { login: string }; merge_method: string } | null;
}
export async function readRestPull(pr: number, repo: RepoInfo): Promise<RestPull> {
  const value = await rest<unknown>("GET", `${restRepoPath(repo)}/pulls/${pr}`);
  const data = restObject(value, "pull request");
  const head = restObject(data.head, "pull request head");
  const base = restObject(data.base, "pull request base");
  restNumber(data.id, "pull request id");
  restString(data.node_id, "pull request node_id");
  if (restNumber(data.number, "pull request number") !== pr)
    throw new Error("REST pull request identity changed");
  restString(data.title, "pull request title");
  restString(data.html_url, "pull request html_url");
  if (data.body !== null && typeof data.body !== "string") malformedRest("pull request body");
  if (data.merged_at !== null && typeof data.merged_at !== "string")
    malformedRest("pull request merged_at");
  restArray(data.requested_reviewers, "requested reviewers");
  restArray(data.requested_teams, "requested teams");
  restString(data.state, "pull request state");
  restBoolean(data.draft, "pull request draft");
  restString(head.sha, "pull request head SHA");
  restString(head.ref, "pull request head ref");
  restString(base.sha, "pull request base SHA");
  restString(base.ref, "pull request base ref");
  restString(data.updated_at, "pull request updated_at");
  if (!Number.isFinite(Date.parse(data.updated_at as string)))
    malformedRest("pull request revision timestamp");
  restString(data.mergeable_state, "pull request mergeable_state");
  if (data.mergeable !== null) restBoolean(data.mergeable, "pull request mergeable");
  await recordRestIdentity(repo, pr, data.node_id as string, String(data.id), "pull");
  return data as unknown as RestPull;
}
export function restPullRefs(pull: RestPull) {
  return {
    number: pull.number,
    state: pull.merged_at ? "MERGED" : pull.state.toUpperCase(),
    headRefName: pull.head.ref,
    headRefOid: pull.head.sha,
    baseRefName: pull.base.ref,
    baseRefOid: pull.base.sha,
  };
}
export function restPullRevision(pull: RestPull): string {
  return JSON.stringify([
    pull.head.ref,
    pull.head.sha,
    pull.base.ref,
    pull.base.sha,
    pull.updated_at,
    pull.state,
    pull.draft,
    pull.merged_at,
    pull.mergeable,
    pull.mergeable_state,
    pull.auto_merge ?? null,
  ]);
}
