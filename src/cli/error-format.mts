import { relative, isAbsolute } from "node:path";
import { GitHubRequestError } from "../github/errors.mts";
import { resolveStateBase } from "../state/base.mts";

/** Safe GitHub transport metadata suitable for user-facing structured error output. */
export function serializeGitHubRequestErrorDetails(err: unknown) {
  if (!(err instanceof GitHubRequestError)) return undefined;

  return {
    ...(err.rateLimit !== undefined && {
      rateLimit: {
        resource: err.rateLimit.resource ?? "unknown",
        limit: err.rateLimit.limit,
        remaining: err.rateLimit.remaining,
        ...(err.rateLimit.used !== undefined && { used: err.rateLimit.used }),
        resetAt: err.rateLimit.resetAt,
      },
    }),
    ...(err.retryAfterSeconds !== undefined && { retryAfterSeconds: err.retryAfterSeconds }),
    ...(err.authSource !== undefined && { credential: err.authSource }),
  };
}

/** One-line hint when `err` is a permission failure on a path inside the state directory. */
function stateDirHint(err: unknown): string | null {
  const { code, path } = (err ?? {}) as { code?: unknown; path?: unknown };
  if ((code !== "EPERM" && code !== "EACCES") || typeof path !== "string") return null;
  const base = resolveStateBase();
  const rel = relative(base, path);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  return `state dir ${base} not writable; set PR_SHEPHERD_STATE_DIR to a writable directory or run outside the sandbox`;
}

export function formatCliError(err: unknown): string {
  const hint = stateDirHint(err);
  const message =
    (err instanceof Error ? err.message : String(err)) + (hint === null ? "" : `\n${hint}`);
  const githubDetails = serializeGitHubRequestErrorDetails(err);
  if (githubDetails === undefined) return message;

  const details: string[] = [];
  if (githubDetails.rateLimit !== undefined) {
    details.push(`resource ${githubDetails.rateLimit.resource}`);
    details.push(`remaining ${githubDetails.rateLimit.remaining}/${githubDetails.rateLimit.limit}`);
    if (githubDetails.rateLimit.used !== undefined) {
      details.push(`used ${githubDetails.rateLimit.used}`);
    }
    details.push(`reset ${new Date(githubDetails.rateLimit.resetAt * 1000).toISOString()}`);
  }
  if (githubDetails.retryAfterSeconds !== undefined) {
    details.push(`retry after ${githubDetails.retryAfterSeconds}s`);
  }
  if (githubDetails.credential !== undefined) {
    details.push(`credential ${githubDetails.credential}`);
  }
  return details.length === 0 ? message : `${message} (${details.join("; ")})`;
}
