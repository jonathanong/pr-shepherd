import { GitHubRequestError } from "../github/errors.mts";

export function formatCliError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (!(err instanceof GitHubRequestError)) return message;

  const details: string[] = [];
  if (err.rateLimit !== undefined) {
    details.push(`resource ${err.rateLimit.resource ?? "unknown"}`);
    details.push(`remaining ${err.rateLimit.remaining}/${err.rateLimit.limit}`);
    if (err.rateLimit.used !== undefined) details.push(`used ${err.rateLimit.used}`);
    details.push(`reset ${new Date(err.rateLimit.resetAt * 1000).toISOString()}`);
  }
  if (err.retryAfterSeconds !== undefined) {
    details.push(`retry after ${err.retryAfterSeconds}s`);
  }
  if (err.authSource !== undefined) details.push(`credential ${err.authSource}`);
  return details.length === 0 ? message : `${message} (${details.join("; ")})`;
}
