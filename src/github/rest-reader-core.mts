import { restWithRateLimit } from "./http.mts";
import type { RepoInfo, RateLimitInfo } from "./client.mts";
import { GitHubRequestError } from "./errors.mts";
import { EXIT } from "../exit-codes.mts";
import { currentRestConditionalKey, recordRestConditionalRead } from "./rest-conditional-scope.mts";

export function restRepoPath(repo: RepoInfo): string {
  return `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
}
export function malformedRest(detail: string): never {
  throw new GitHubRequestError(`Malformed or incomplete GitHub REST response: ${detail}`, {
    status: 200,
    exitCodeOverride: EXIT.SOFTWARE,
  });
}
export function restObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) malformedRest(label);
  return value as Record<string, unknown>;
}
export function restString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) malformedRest(label);
  return value;
}
export function restNumber(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) malformedRest(label);
  return value as number;
}
export function restBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") malformedRest(label);
  return value;
}
export function restArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) malformedRest(label);
  return value;
}

/** Counted REST envelopes must include the count as well as their list. */
export function restCollection(value: unknown, key: string): unknown[] {
  const record = restObject(value, key);
  restNumber(record.total_count, `${key}.total_count`);
  return restArray(record[key], key);
}

const REST_PAGE_SIZE = 100;

/** Complete REST connections; follow GitHub's Link, never infer completeness from a short page. */
export async function readRestPages<T>(
  path: string,
  select: (body: unknown) => T[] = (body) => restArray(body, path) as T[],
): Promise<{ nodes: T[]; rateLimit?: RateLimitInfo }> {
  let next: string | undefined =
    `${path}${path.includes("?") ? "&" : "?"}per_page=${REST_PAGE_SIZE}`;
  const visited = new Set<string>();
  const nodes: T[] = [];
  let rateLimit: RateLimitInfo | undefined;
  let total: number | undefined;
  while (next) {
    if (visited.has(next) || visited.size >= 1_000)
      malformedRest(`pagination cycle or limit at ${next}`);
    visited.add(next);
    let result = await readRestRequest<unknown>("GET", next);
    let page = select(result.data);
    if (!Array.isArray(page)) malformedRest(`missing page at ${next}`);
    // A full page's body (and ETag) stays the same when an item is appended past it; only its
    // Link gains rel="next". A 304 can't prove the cached terminal Link is still current, so a
    // full page without a next link is re-read fresh rather than hiding items on a later page.
    if (
      result.status === 304 &&
      page.length >= REST_PAGE_SIZE &&
      nextRestPage(result.link, path) === undefined
    ) {
      result = await readRestRequest<unknown>("GET", next, undefined, true);
      page = select(result.data);
      if (!Array.isArray(page)) malformedRest(`missing page at ${next}`);
    }
    rateLimit = result.rateLimit ?? rateLimit;
    nodes.push(...page);
    if (
      result.data &&
      typeof result.data === "object" &&
      !Array.isArray(result.data) &&
      "total_count" in result.data
    ) {
      const count = restNumber(result.data.total_count, `${path}.total_count`);
      if (total !== undefined && total !== count)
        malformedRest(`${path} changed during pagination`);
      total = count;
    }
    next = nextRestPage(result.link, path);
    if (next && page.length === 0) malformedRest(`${path}: empty page with next link`);
  }
  if (total !== undefined && nodes.length !== total)
    malformedRest(`${path}: ${nodes.length} of ${total} items`);
  return { nodes, rateLimit };
}

function nextRestPage(link: string | undefined, original: string): string | undefined {
  if (!link) return undefined;
  const entries = link.split(",");
  const nextEntries = entries.filter((entry) => /rel="next"/.test(entry));
  if (nextEntries.length === 0) return undefined;
  if (nextEntries.length !== 1) malformedRest(`multiple next links for ${original}`);
  const match = /^\s*<([^>]+)>;\s*rel="next"\s*$/.exec(nextEntries[0]!);
  if (!match) malformedRest(`invalid pagination link for ${original}`);
  const url = new URL(match[1]!, "https://api.github.com");
  if (url.origin !== "https://api.github.com" || url.pathname !== original.split("?")[0])
    malformedRest(`unsafe pagination link for ${original}`);
  if (url.searchParams.get("per_page") !== "100")
    malformedRest(`changed page size for ${original}`);
  const source = new URL(original, "https://api.github.com");
  for (const key of new Set(source.searchParams.keys())) {
    if (
      key !== "page" &&
      key !== "per_page" &&
      JSON.stringify(url.searchParams.getAll(key)) !==
        JSON.stringify(source.searchParams.getAll(key))
    )
      malformedRest(`changed pagination filter for ${original}`);
  }
  return `${url.pathname}${url.search}`;
}

/** A pull request whose mergeability GitHub is still computing must be re-read, never replayed. */
function isSettledBody(body: unknown): boolean {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return true;
  const record = body as Record<string, unknown>;
  return record.mergeable !== null && record.mergeable_state !== "unknown";
}

let activeRequests = 0;
const pendingRequests: Array<() => void> = [];
/** Bound independent snapshots and nested connection reads to four HTTP requests together. */
async function readRestRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  revalidate = false,
) {
  if (activeRequests >= 4) await new Promise<void>((resolve) => pendingRequests.push(resolve));
  else activeRequests++;
  try {
    const key = method === "GET" ? currentRestConditionalKey() : undefined;
    if (key === undefined) return await restWithRateLimit<T>(method, path, body);
    const result = await restWithRateLimit<T>(method, path, body, {
      conditional: { key, name: path, shouldStore: isSettledBody, revalidate },
    });
    const unvalidated =
      result.status !== 304 && result.etag === undefined && isSettledBody(result.data);
    recordRestConditionalRead(
      path,
      result.status === 304,
      result.etag,
      unvalidated ? result.data : undefined,
    );
    return result;
  } finally {
    const waiting = pendingRequests.shift();
    if (waiting) waiting();
    else activeRequests--;
  }
}
export async function readRest<T>(method: string, path: string, body?: unknown): Promise<T> {
  return (await readRestRequest<T>(method, path, body)).data;
}
