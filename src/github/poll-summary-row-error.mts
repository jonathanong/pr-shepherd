import type { PollSummaryCommandOptions, PollSummaryItem } from "../types.mts";
import type { RepoInfo } from "./client.mts";
import { GitHubRequestError } from "./errors.mts";
import { hydratePollSummaryChecks } from "./poll-summary-check-hydration.mts";
import { refreshUnknownSummaryMergeability } from "./poll-summary-mergeability.mts";
import { pollCommandFields } from "./poll-summary-command.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";
import { normalizePollSummaryState } from "./poll-summary-route.mts";
import { rateLimitKind } from "./rate-limit-kind.mts";
import { isGithubReadFallbackError } from "./transport.mts";
import { formatPrUrl } from "../pr-reference.mts";

/**
 * Whether one PR's failed read becomes a row. Throttles, credential failures, and
 * errors that switch transport describe the whole tick, so they still reject it.
 */
function isIsolatableRowError(error: unknown): boolean {
  if (isGithubReadFallbackError(error)) return false;
  if (!(error instanceof GitHubRequestError)) return true;
  return error.status !== 401 && rateLimitKind(error) === null;
}

/** `failures` maps a PR to the isolatable error that stopped its chunk-time hydration. */
export interface ExplicitChunk {
  prs: RawSummaryPr[];
  failures?: Map<number, unknown>;
}

/** Hydrate each PR's checks and mergeability; one PR's unreadable checks must not fail its siblings. */
export async function hydrateRowsIsolated(
  raws: RawSummaryPr[],
  repo: RepoInfo,
): Promise<Map<number, unknown>> {
  const failures = new Map<number, unknown>();
  for (const raw of raws) {
    try {
      await hydratePollSummaryChecks(raw, repo);
      await refreshUnknownSummaryMergeability(raw, repo);
    } catch (error) {
      if (!isIsolatableRowError(error)) throw error;
      failures.set(raw.number, error);
    }
  }
  return failures;
}

/** A non-terminal row whose `pollCommand` runs the authoritative one-PR session. */
function readFailureRow(
  raw: RawSummaryPr,
  repo: RepoInfo,
  opts: PollSummaryCommandOptions,
  error: unknown,
): PollSummaryItem {
  const repoName = `${repo.owner}/${repo.name}`;
  return {
    pr: raw.number,
    repo: repoName,
    ...(raw.transport && { transport: raw.transport }),
    title: raw.title,
    url: raw.url || formatPrUrl(repoName, raw.number),
    action: "triage",
    reasons: ["summary-read-failed"],
    error: error instanceof Error ? error.message : String(error),
    state: normalizePollSummaryState(raw.state),
    mergeable: raw.mergeable as PollSummaryItem["mergeable"],
    mergeStateStatus: raw.mergeStateStatus as PollSummaryItem["mergeStateStatus"],
    headRefName: raw.headRefName,
    headRefOid: raw.headRefOid,
    baseRefName: raw.baseRefName,
    ...(raw.isDraft && { isDraft: true as const }),
    ...pollCommandFields(repoName, raw.number, raw.isDraft, opts),
  };
}

/**
 * Summarize each PR, turning an isolatable failure into a row. `failures` holds
 * PRs whose chunk-time hydration already failed. A fatal error, or no readable
 * row at all, rejects the tick with the first such error.
 */
export async function summarizeRowsIsolated(
  raws: RawSummaryPr[],
  failures: Map<number, unknown>,
  repo: RepoInfo,
  opts: PollSummaryCommandOptions,
  summarize: (raw: RawSummaryPr) => Promise<PollSummaryItem>,
): Promise<PollSummaryItem[]> {
  const settled = await Promise.allSettled(
    raws.map((raw) =>
      failures.has(raw.number) ? Promise.reject(failures.get(raw.number)) : summarize(raw),
    ),
  );
  const rejected = settled.filter(
    (entry): entry is PromiseRejectedResult => entry.status === "rejected",
  );
  const fatal = rejected.find((entry) => !isIsolatableRowError(entry.reason));
  if (fatal) throw fatal.reason;
  if (rejected.length === settled.length) throw rejected[0]!.reason;
  return settled.map((entry, index) =>
    entry.status === "fulfilled"
      ? entry.value
      : readFailureRow(raws[index]!, repo, opts, entry.reason),
  );
}
