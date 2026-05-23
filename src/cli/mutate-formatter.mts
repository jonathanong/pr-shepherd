import type { ResolveResult } from "../comments/resolve.mts";

function pushIds(lines: string[], label: string, ids: string[] | undefined): void {
  if (ids?.length) lines.push(`${label} (${ids.length}): ${ids.join(", ")}`);
}

function formatRateLimit(result: ResolveResult): string | null {
  if (!result.rateLimit) return null;
  const details = [
    result.rateLimit.retryAfterSeconds !== undefined
      ? `retry after ${result.rateLimit.retryAfterSeconds}s`
      : null,
    result.rateLimit.remaining !== undefined && result.rateLimit.limit !== undefined
      ? `remaining ${result.rateLimit.remaining}/${result.rateLimit.limit}`
      : null,
    result.rateLimit.resetAt !== undefined
      ? `reset at ${new Date(result.rateLimit.resetAt * 1000).toISOString()}`
      : null,
  ]
    .filter(Boolean)
    .join(", ");
  return `Stopped: GitHub rate limit hit — ${result.rateLimit.message}${details ? ` (${details})` : ""}`;
}

export function formatMutateResult(result: ResolveResult): string {
  const lines: string[] = [];
  pushIds(lines, "Replied to threads", result.repliedThreads);
  pushIds(lines, "Resolved threads", result.resolvedThreads);
  pushIds(lines, "Minimized comments", result.minimizedComments);
  pushIds(lines, "Dismissed reviews", result.dismissedReviews);
  pushIds(lines, "Skipped dismissals", result.skippedDismissals);
  pushIds(lines, "Skipped human thread resolves", result.skippedHumanResolves);
  pushIds(lines, "Skipped human minimizes", result.skippedHumanMinimizes);
  pushIds(lines, "Skipped human review dismissals", result.skippedHumanDismissals);
  const rateLimit = formatRateLimit(result);
  if (rateLimit) lines.push(rateLimit);
  pushIds(lines, "Not replied due to rate limit", result.unrepliedThreads);
  pushIds(lines, "Not resolved due to rate limit", result.unresolvedThreads);
  pushIds(lines, "Not minimized due to rate limit", result.unminimizedComments);
  pushIds(lines, "Not dismissed due to rate limit", result.undismissedReviews);
  const errors = result.rateLimit
    ? result.errors.filter((e) => !e.startsWith("rate limit:"))
    : result.errors;
  if (errors.length) lines.push(`Errors:\n  ${errors.join("\n  ")}`);
  return lines.join("\n");
}
