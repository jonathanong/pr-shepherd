/* eslint-disable max-lines */
import { graphql, getCurrentPrNumber, getRepoInfo } from "../github/client.mts";
import { paginateForward, type Connection } from "../github/pagination.mts";
import type { RepoInfo } from "../github/client.mts";
import type { ResolveRateLimitStop } from "../comments/rate-limit.mts";
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
  authorizationSkipped?: "unverifiable";
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
    ...(selected.pathsToMark.length > 0 && { authorizationSkipped: "unverifiable" as const }),
  };

  // GitHub exposes no exact viewer capability for markFileAsViewed. Repository role and
  // viewerCanEditFiles describe different operations, so this command fails closed.
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
