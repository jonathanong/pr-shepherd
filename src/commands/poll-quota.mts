import type { GraphqlQuotaWarningBand } from "../config/load.mts";
import { summarizeApiTelemetry } from "../github/api-telemetry.mts";
import { GitHubRequestError } from "../github/errors.mts";
import { isRateLimitMessage } from "../comments/rate-limit.mts";
import { exhaustedPrimaryLimitDelayMs } from "./poll-rate-limit-delay.mts";
import { selectQuotaWarning } from "./quota-selection.mts";
import type { ApiResourceUsage, GraphqlApiUsage, PollSummaryResult } from "../types.mts";

const GRAPHQL_RETRY_AFTER_DEFAULT_MS = 60_000;

/** Sleep at least `--interval`, and at least the active crossed quota band. */
function graphqlQuotaPollIntervalMs(
  bands: GraphqlQuotaWarningBand[],
  usage: Pick<GraphqlApiUsage, "remaining" | "limit"> | undefined,
  fallbackMs: number,
  maxMs: number,
): number {
  if (usage === undefined || usage.limit <= 0 || bands.length === 0) {
    return Math.min(fallbackMs, maxMs);
  }
  const crossed = bands.filter(
    (band) => usage.remaining * 100 <= usage.limit * band.remainingPercent,
  );
  if (crossed.length === 0) return Math.min(fallbackMs, maxMs);
  const active = crossed.reduce((lowest, band) =>
    band.remainingPercent < lowest.remainingPercent ? band : lowest,
  );
  const bandMs = active.pollIntervalMinutes * 60_000;
  return Math.min(Math.max(fallbackMs, bandMs), maxMs);
}

/** Slow the poll for whichever of GraphQL or REST core is in a tighter band. */
export function quotaPollIntervalMs(
  bands: GraphqlQuotaWarningBand[],
  usage:
    | {
        graphql?: Pick<GraphqlApiUsage, "remaining" | "limit">;
        rest?: Pick<ApiResourceUsage, "resource" | "remaining" | "limit">[];
      }
    | undefined,
  fallbackMs: number,
  maxMs: number,
): number {
  const core = usage?.rest?.find((item) => item.resource === "core");
  return Math.max(
    graphqlQuotaPollIntervalMs(bands, usage?.graphql, fallbackMs, maxMs),
    graphqlQuotaPollIntervalMs(bands, core, fallbackMs, maxMs),
  );
}

export interface RateLimitRetry {
  ms: number;
  resource: string;
  remaining?: number;
  limit?: number;
  resetAt?: number;
}

/**
 * Retry delay for `--until-terminal` when GitHub exhausts a primary quota or
 * returns a secondary limit. `null` means the error is not a retryable rate limit.
 */
export function pollRateLimitRetryAfterMs(err: unknown): RateLimitRetry | null {
  if (!(err instanceof GitHubRequestError)) return null;
  const rateLimitMessage =
    isRateLimitMessage(err.message) ||
    (err.graphqlErrors?.some((error) => isRateLimitMessage(error.message)) ?? false);
  const exhausted = err.rateLimit !== undefined && err.rateLimit.remaining <= 0;
  const retryable =
    err.status === 429 || err.retryAfterSeconds !== undefined || rateLimitMessage || exhausted;
  if (!retryable) return null;
  const resource = retryResource(err);
  const rateLimit = err.rateLimit;
  const details = {
    resource,
    ...(rateLimit?.remaining !== undefined && { remaining: rateLimit.remaining }),
    ...(rateLimit?.limit !== undefined && { limit: rateLimit.limit }),
    ...(rateLimit?.resetAt !== undefined && { resetAt: rateLimit.resetAt }),
  };
  if (err.retryAfterSeconds !== undefined) {
    return { ...details, ms: Math.max(err.retryAfterSeconds, 0) * 1000 };
  }
  if (exhausted && rateLimit !== undefined) {
    return { ...details, ms: exhaustedPrimaryLimitDelayMs(rateLimit.resetAt, Date.now()) };
  }
  return { ...details, ms: GRAPHQL_RETRY_AFTER_DEFAULT_MS };
}

function retryResource(err: GitHubRequestError): string {
  if (err.rateLimit?.resource) return err.rateLimit.resource;
  const secondary =
    err.status === 429 ||
    err.retryAfterSeconds !== undefined ||
    /secondary/i.test(err.message) ||
    (err.graphqlErrors?.some((error) => /secondary/i.test(error.message)) ?? false);
  return secondary ? "secondary" : "graphql";
}

function rateLimitResourceLabel(resource: string): string {
  if (resource === "graphql") return "GitHub GraphQL rate limit";
  if (resource === "secondary") return "GitHub secondary rate limit";
  return `GitHub REST ${resource} rate limit`;
}

function rateLimitCounts(retry: RateLimitRetry): string {
  return retry.remaining !== undefined && retry.limit !== undefined
    ? ` (${retry.remaining}/${retry.limit})`
    : "";
}

function rateLimitClock(retry: RateLimitRetry): string {
  const resetAt = retry.resetAt ?? Math.ceil((Date.now() + retry.ms) / 1000);
  return `${new Date(resetAt * 1000).toISOString().slice(11, 19)}Z`;
}

/** Stderr line naming the exhausted budget and when the sleep ends. */
export function formatRateLimitRetryLine(
  tickLabel: string,
  elapsedSeconds: number,
  retry: RateLimitRetry,
): string {
  const clock = rateLimitClock(retry);
  return `[${tickLabel} / +${elapsedSeconds}s] ${rateLimitResourceLabel(retry.resource)}${rateLimitCounts(retry)} — retrying at ${clock} (in ${Math.round(retry.ms / 1000)}s)\n`;
}

/** One stderr line before `--until-terminal` gives up and exits 75. */
export function formatRateLimitGiveUpLine(
  tickLabel: string,
  elapsedSeconds: number,
  retry: RateLimitRetry,
): string {
  const clock = rateLimitClock(retry);
  return `[${tickLabel} / +${elapsedSeconds}s] ${rateLimitResourceLabel(retry.resource)}${rateLimitCounts(retry)} still exhausted at ${clock} after 5 attempts with no progress\n`;
}

export async function aggregateQuotaWarning(
  result: PollSummaryResult,
  bands: GraphqlQuotaWarningBand[],
  intervalSeconds: number,
): Promise<PollSummaryResult["quotaWarning"]> {
  const usage = summarizeApiTelemetry();
  const [owner, repo] = result.repo.split("/");
  if (!usage || !owner || !repo) return undefined;
  if (!usage.graphql && !usage.rest?.some((item) => item.resource === "core")) return undefined;
  return selectQuotaWarning(
    { owner, repo },
    bands.map((band) => ({
      ...band,
      pollIntervalMinutes: Math.max(band.pollIntervalMinutes, intervalSeconds / 60),
    })),
    usage,
    true,
  );
}
