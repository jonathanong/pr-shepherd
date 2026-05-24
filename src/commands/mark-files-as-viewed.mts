/* eslint-disable max-lines */
import {
  graphql,
  graphqlWithRateLimit,
  getCurrentPrNumber,
  getRepoInfo,
} from "../github/client.mts";
import { paginateForward, type Connection } from "../github/pagination.mts";
import type { RepoInfo } from "../github/client.mts";
import {
  isRateLimitMessage,
  rateLimitFromError,
  rateLimitFromGraphQlResult,
  type ResolveRateLimitStop,
} from "../comments/rate-limit.mts";
import type { GlobalOptions } from "../types.mts";

export interface MarkFilesAsViewedOptions extends GlobalOptions {
  prNumber?: number;
  files: string[];
  tests?: boolean;
  matchPatterns?: string[];
}

interface ChangedFile {
  path: string;
  viewerViewedState?: string | null;
}

export interface MarkFilesAsViewedResult {
  repo: string;
  prNumber: number;
  pullRequestId: string;
  requestedPaths: string[];
  testSelector: boolean;
  matchPatterns: string[];
  matchedPaths: string[];
  markedPaths: string[];
  alreadyViewedPaths: string[];
  missingPaths: string[];
  unmatchedSelectors: string[];
  errors: string[];
  rateLimit?: ResolveRateLimitStop;
  unmarkedPaths?: string[];
}

interface PullRequestFilesResponse {
  repository: {
    pullRequest: {
      id: string;
      number: number;
      files: Connection<ChangedFile>;
    } | null;
  } | null;
}

interface GraphQlErrorLike {
  message: string;
  path?: unknown;
}

const FILES_QUERY = `query PullRequestFiles($owner: String!, $repo: String!, $pr: Int!, $filesCursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      id
      number
      files(first: 100, after: $filesCursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          path
          viewerViewedState
        }
      }
    }
  }
}`;

const TEST_FILE_RE =
  /(^|\/)(tests?|__tests__|spec)(\/|$)|\.(test|spec)\.[cm]?[jt]sx?$|_tests?\.rs$|(^|\/)tests?\.rs$/i;

const BULK_CHUNK_SIZE = 10;

export async function runMarkFilesAsViewed(
  opts: MarkFilesAsViewedOptions,
): Promise<MarkFilesAsViewedResult> {
  const repo = await getRepoInfo();
  const prNumber = opts.prNumber ?? (await getCurrentPrNumber());
  if (!prNumber) throw new Error("No PR number provided and no current branch PR found");

  const matchPatterns = opts.matchPatterns ?? [];
  const matchRegexes = matchPatterns.map((pattern) => compilePattern(pattern));
  const fetched = await fetchPullRequestFiles(prNumber, repo);
  const selected = selectChangedFiles(fetched.files, {
    files: opts.files,
    tests: opts.tests === true,
    matchPatterns,
    matchRegexes,
  });

  const result: MarkFilesAsViewedResult = {
    repo: `${repo.owner}/${repo.name}`,
    prNumber,
    pullRequestId: fetched.pullRequestId,
    requestedPaths: opts.files,
    testSelector: opts.tests === true,
    matchPatterns,
    matchedPaths: selected.matchedPaths,
    markedPaths: [],
    alreadyViewedPaths: selected.alreadyViewedPaths,
    missingPaths: selected.missingPaths,
    unmatchedSelectors: selected.unmatchedSelectors,
    errors: [],
  };

  await bulkMarkFilesAsViewed(fetched.pullRequestId, selected.pathsToMark, result);
  return result;
}

async function fetchPullRequestFiles(
  pr: number,
  repo: RepoInfo,
): Promise<{ pullRequestId: string; files: ChangedFile[] }> {
  const first = await graphql<PullRequestFilesResponse>(FILES_QUERY, {
    owner: repo.owner,
    repo: repo.name,
    pr,
  });
  const raw = first.data.repository?.pullRequest;
  if (!raw) throw new Error(`PR #${pr} not found`);

  let files = raw.files.nodes;
  if (raw.files.pageInfo.hasNextPage && raw.files.pageInfo.endCursor) {
    const extra = await paginateForward<ChangedFile>(async (cursor) => {
      const res = await graphql<PullRequestFilesResponse>(FILES_QUERY, {
        owner: repo.owner,
        repo: repo.name,
        pr,
        ...(cursor ? { filesCursor: cursor } : {}),
      });
      const pr2 = res.data.repository?.pullRequest;
      if (!pr2) throw new Error(`PR #${pr} not found`);
      return pr2.files;
    }, raw.files.pageInfo.endCursor);
    files = [...files, ...extra];
  }

  return { pullRequestId: raw.id, files };
}

function compilePattern(pattern: string): RegExp {
  try {
    return new RegExp(pattern, "i");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Invalid --match regex ${JSON.stringify(pattern)}: ${msg}`);
  }
}

function selectChangedFiles(
  changedFiles: ChangedFile[],
  opts: {
    files: string[];
    tests: boolean;
    matchPatterns: string[];
    matchRegexes: RegExp[];
  },
): {
  matchedPaths: string[];
  alreadyViewedPaths: string[];
  missingPaths: string[];
  unmatchedSelectors: string[];
  pathsToMark: string[];
} {
  const byPath = new Map(changedFiles.map((f) => [f.path, f]));
  const matched = new Set<string>();
  const missingPaths: string[] = [];
  const unmatchedSelectors: string[] = [];

  for (const path of opts.files) {
    if (byPath.has(path)) matched.add(path);
    else missingPaths.push(path);
  }

  if (opts.tests) {
    let matchedAny = false;
    for (const file of changedFiles) {
      if (TEST_FILE_RE.test(file.path)) {
        matched.add(file.path);
        matchedAny = true;
      }
    }
    if (!matchedAny) unmatchedSelectors.push("--tests");
  }

  for (let i = 0; i < opts.matchRegexes.length; i += 1) {
    let matchedAny = false;
    const regex = opts.matchRegexes[i]!;
    for (const file of changedFiles) {
      if (regex.test(file.path)) {
        matched.add(file.path);
        matchedAny = true;
      }
    }
    if (!matchedAny) unmatchedSelectors.push(`--match ${opts.matchPatterns[i]!}`);
  }

  const matchedPaths = [...matched];
  const alreadyViewedPaths = matchedPaths.filter(
    (path) => byPath.get(path)?.viewerViewedState === "VIEWED",
  );
  const alreadyViewedSet = new Set(alreadyViewedPaths);
  const pathsToMark = matchedPaths.filter((path) => !alreadyViewedSet.has(path));

  return { matchedPaths, alreadyViewedPaths, missingPaths, unmatchedSelectors, pathsToMark };
}

function buildBulkMutation(paths: string[]): string {
  const ops = paths.map(
    (path, i) =>
      `  m${i}: markFileAsViewed(input: { pullRequestId: $pullRequestId, path: ${JSON.stringify(path)} }) { pullRequest { id } }`,
  );
  return `mutation BulkMarkFilesAsViewed($pullRequestId: ID!) {\n${ops.join("\n")}\n}`;
}

async function bulkMarkFilesAsViewed(
  pullRequestId: string,
  paths: string[],
  result: MarkFilesAsViewedResult,
): Promise<void> {
  for (let i = 0; i < paths.length; i += BULK_CHUNK_SIZE) {
    const chunk = paths.slice(i, i + BULK_CHUNK_SIZE);
    // eslint-disable-next-line no-await-in-loop
    const stopped = await bulkMarkFilesAsViewedChunk(
      pullRequestId,
      chunk,
      result,
      i + BULK_CHUNK_SIZE < paths.length,
    );
    if (stopped) {
      const markedSet = new Set(result.markedPaths);
      result.unmarkedPaths = paths.slice(i).filter((path) => !markedSet.has(path));
      return;
    }
  }
}

async function bulkMarkFilesAsViewedChunk(
  pullRequestId: string,
  paths: string[],
  result: MarkFilesAsViewedResult,
  hasPendingAfter: boolean,
): Promise<boolean> {
  if (paths.length === 0) return false;

  let data: Record<string, unknown> = {};
  let graphQlErrors: GraphQlErrorLike[] = [];
  let suppressCurrentChunkErrors = false;
  let rateLimitStop: ResolveRateLimitStop | undefined;
  try {
    const resp = await graphqlWithRateLimit<Record<string, unknown>>(buildBulkMutation(paths), {
      pullRequestId,
    });
    data = resp.data;
    graphQlErrors = (resp.errors ?? []) as GraphQlErrorLike[];
    const messages = graphQlErrors.map((e) => e.message);
    suppressCurrentChunkErrors = messages.some(isRateLimitMessage);
    rateLimitStop = rateLimitFromGraphQlResult(messages, {
      rateLimit: resp.rateLimit,
      retryAfterSeconds: resp.retryAfterSeconds,
      stopOnZeroRemaining: hasPendingAfter,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stop = rateLimitFromError(err, msg);
    if (stop) {
      result.errors.push(`rate limit: ${stop.message}`);
      result.rateLimit = stop;
      return true;
    }
    for (const path of paths) result.errors.push(`${path}: ${msg}`);
    return false;
  }

  const errorMessagesByAlias = mapAliasErrors(graphQlErrors);
  for (let i = 0; i < paths.length; i += 1) {
    const alias = `m${i}`;
    const m = data[alias] as { pullRequest?: { id?: string } } | null | undefined;
    if (m?.pullRequest?.id === pullRequestId) {
      result.markedPaths.push(paths[i]!);
    } else if (!suppressCurrentChunkErrors) {
      result.errors.push(
        `${paths[i]!}: ${errorMessagesByAlias.get(alias) ?? "mark returned null"}`,
      );
    }
  }

  if (rateLimitStop) {
    result.errors.push(`rate limit: ${rateLimitStop.message}`);
    result.rateLimit = rateLimitStop;
    return true;
  }

  return false;
}

function mapAliasErrors(errors: GraphQlErrorLike[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const error of errors) {
    if (!Array.isArray(error.path)) continue;
    const alias = error.path.find((part) => typeof part === "string" && isMarkAlias(part));
    if (typeof alias === "string") out.set(alias, error.message);
  }
  return out;
}

function isMarkAlias(value: string): boolean {
  if (!value.startsWith("m")) return false;
  if (value.length === 1) return false;
  for (const char of value.slice(1)) {
    if (char < "0" || char > "9") return false;
  }
  return true;
}
