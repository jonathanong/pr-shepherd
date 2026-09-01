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
import { EXIT, ShepherdError } from "../exit-codes.mts";
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
  /** @deprecated Explicit file-view requests are attempted; GitHub authorizes the mutation. */
  authorizationSkipped?: "unverifiable";
}

interface GraphQlErrorLike {
  message: string;
  path?: unknown;
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

const FILES_QUERY = `query PullRequestFiles($owner: String!, $repo: String!, $pr: Int!, $filesCursor: String) {
  _shepherdRateLimit: rateLimit {
    cost
    limit
    nodeCount
    remaining
    resetAt
    used
  }
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

// Keep mutation batches small so rate-limit stops leave an ordered pending list.
const MARK_FILES_CHUNK_SIZE = 10;

/** @deprecated Hidden implementation for `mark-files-as-viewed`; use `apply files`. */
export async function runMarkFilesAsViewed(
  opts: MarkFilesAsViewedOptions,
): Promise<MarkFilesAsViewedResult> {
  const repo = opts.targetRepository ?? (await getRepoInfo());
  const prNumber = opts.prNumber ?? (await getCurrentPrNumber());
  if (!prNumber) {
    throw new ShepherdError(
      "No PR number provided and no current branch PR found",
      EXIT.UNAVAILABLE,
    );
  }

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

  await markFilesAsViewed(fetched.pullRequestId, selected.pathsToMark, result);
  return result;
}

async function markFilesAsViewed(
  pullRequestId: string,
  paths: string[],
  result: MarkFilesAsViewedResult,
): Promise<void> {
  for (let offset = 0; offset < paths.length; offset += MARK_FILES_CHUNK_SIZE) {
    const chunk = paths.slice(offset, offset + MARK_FILES_CHUNK_SIZE);
    // eslint-disable-next-line no-await-in-loop
    const pendingPaths = await markFilesChunk(
      pullRequestId,
      chunk,
      result,
      offset + MARK_FILES_CHUNK_SIZE < paths.length,
    );
    if (pendingPaths === null) continue;
    const unmarkedPaths = [...pendingPaths, ...paths.slice(offset + chunk.length)];
    if (unmarkedPaths.length > 0) result.unmarkedPaths = unmarkedPaths;
    return;
  }
}

/** Returns pending paths when a rate limit stops further mutation batches. */
async function markFilesChunk(
  pullRequestId: string,
  paths: string[],
  result: MarkFilesAsViewedResult,
  hasPendingAfter: boolean,
): Promise<string[] | null> {
  let data: Record<string, unknown> = {};
  let errors: GraphQlErrorLike[] = [];
  let rateLimit: ResolveRateLimitStop | undefined;
  try {
    const response = await graphqlWithRateLimit<Record<string, unknown>>(
      buildMarkFilesMutation(pullRequestId, paths),
      {},
      { allowPartialData: true },
    );
    data = response.data;
    errors = (response.errors ?? []) as GraphQlErrorLike[];
    rateLimit = rateLimitFromGraphQlResult(
      errors.map((error) => error.message),
      {
        rateLimit: response.rateLimit,
        retryAfterSeconds: response.retryAfterSeconds,
        stopOnZeroRemaining: hasPendingAfter,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stop = rateLimitFromError(error, message);
    if (stop) {
      result.errors.push(`rate limit: ${stop.message}`);
      result.rateLimit = stop;
      return paths;
    }
    for (const path of paths) result.errors.push(`${path}: ${message}`);
    return null;
  }

  const aliasesWithNonRateErrors = new Set<number>();
  const aliasesWithRateLimitErrors = new Set<number>();
  const unscopedNonRateMessages: string[] = [];
  for (const error of errors) {
    const aliasIndex = markFileErrorAliasIndex(error);
    if (aliasIndex === undefined || aliasIndex >= paths.length) {
      if (!isRateLimitMessage(error.message)) unscopedNonRateMessages.push(error.message);
      continue;
    }
    if (isRateLimitMessage(error.message)) aliasesWithRateLimitErrors.add(aliasIndex);
    else aliasesWithNonRateErrors.add(aliasIndex);
  }

  const pendingPaths: string[] = [];
  for (let index = 0; index < paths.length; index += 1) {
    const path = paths[index]!;
    if (data[`f${index}`] != null) {
      result.markedPaths.push(path);
      continue;
    }
    const messages = errorsForMarkFileAlias(errors, index);
    const hasRateLimitError = aliasesWithRateLimitErrors.has(index);
    const nonRateMessages = aliasesWithNonRateErrors.has(index)
      ? messages.filter((message) => !isRateLimitMessage(message))
      : unscopedNonRateMessages;
    if (nonRateMessages.length > 0) {
      for (const message of nonRateMessages) result.errors.push(`${path}: ${message}`);
    } else if (!rateLimit) {
      result.errors.push(`${path}: ${messages[0] ?? "mark returned null"}`);
    }
    if (rateLimit && (hasRateLimitError || nonRateMessages.length === 0)) pendingPaths.push(path);
  }

  if (!rateLimit) return null;
  result.errors.push(`rate limit: ${rateLimit.message}`);
  result.rateLimit = rateLimit;
  return pendingPaths;
}

function buildMarkFilesMutation(pullRequestId: string, paths: string[]): string {
  const operations = paths.map(
    (path, index) =>
      `  f${index}: markFileAsViewed(input: { pullRequestId: ${JSON.stringify(pullRequestId)}, path: ${JSON.stringify(path)} }) { clientMutationId }`,
  );
  return `mutation MarkFilesAsViewed {\n${operations.join("\n")}\n}`;
}

function markFileErrorAliasIndex(error: GraphQlErrorLike): number | undefined {
  if (!Array.isArray(error.path)) return undefined;
  const alias = error.path.find((part) => typeof part === "string" && /^f\d+$/.test(part));
  if (typeof alias !== "string") return undefined;
  const index = Number.parseInt(alias.slice(1), 10);
  return Number.isNaN(index) ? undefined : index;
}

function errorsForMarkFileAlias(errors: GraphQlErrorLike[], index: number): string[] {
  return errors
    .filter((error) => markFileErrorAliasIndex(error) === index)
    .map((error) => error.message);
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
  if (!raw) throw new ShepherdError(`PR #${pr} not found`, EXIT.UNAVAILABLE);

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
      if (!pr2) throw new ShepherdError(`PR #${pr} not found`, EXIT.UNAVAILABLE);
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
    throw new ShepherdError(`Invalid --match regex ${JSON.stringify(pattern)}: ${msg}`, EXIT.USAGE);
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
