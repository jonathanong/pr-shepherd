import type { GraphqlQuotaWarningBand } from "../config/load.mts";
import { GitHubRequestError } from "../github/errors.mts";
import { isRateLimitMessage } from "../comments/rate-limit.mts";
import type { GraphqlApiUsage } from "../types.mts";

const GRAPHQL_RETRY_AFTER_DEFAULT_MS = 60_000;

/** Sleep at least `--interval`, and at least the tightest crossed quota band. */
export function graphqlQuotaPollIntervalMs(
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
  const bandMs = Math.max(...crossed.map((band) => band.pollIntervalMinutes)) * 60_000;
  return Math.min(Math.max(fallbackMs, bandMs), maxMs);
}

/**
 * Retry delay for `--until-terminal` when GitHub returns a GraphQL 429 / secondary
 * limit. `null` means the error is not a retryable rate limit.
 */
export function pollGraphQlRetryAfterMs(err: unknown): number | null {
  if (!(err instanceof GitHubRequestError)) return null;
  const retryable =
    err.status === 429 ||
    err.retryAfterSeconds !== undefined ||
    isRateLimitMessage(err.message) ||
    (err.graphqlErrors?.some((error) => isRateLimitMessage(error.message)) ?? false);
  if (!retryable) return null;
  if (err.retryAfterSeconds === undefined) return GRAPHQL_RETRY_AFTER_DEFAULT_MS;
  return Math.max(err.retryAfterSeconds, 0) * 1000;
}
