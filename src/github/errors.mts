import { EXIT, ShepherdError } from "../exit-codes.mts";
import type { RateLimitInfo } from "./http.mts";

export interface GitHubGraphQlError {
  message: string;
  path?: unknown;
}

// GitHub's GraphQL API reports field-level permission failures (e.g. a fine-grained
// PAT missing a scope) as an `errors[].message` entry at HTTP 200, not as an HTTP
// 401/403 — the transport-level request succeeded even though one field could not
// be resolved. Status alone can't see this, so classification must also inspect the
// GraphQL error messages themselves.
const GRAPHQL_PERMISSION_ERROR = /resource not accessible/i;

function hasPermissionError(graphqlErrors?: GitHubGraphQlError[]): boolean {
  return graphqlErrors?.some((e) => GRAPHQL_PERMISSION_ERROR.test(e.message)) ?? false;
}

function classifyStatus(
  status: number,
  rateLimit?: RateLimitInfo,
  retryAfterSeconds?: number,
  graphqlErrors?: GitHubGraphQlError[],
) {
  // Retry signals take priority over everything else: GitHub's secondary rate limit
  // returns 403 with a Retry-After header, which is a transient throttle — not the
  // permission-denied 403 a bad/missing token produces. Treat any retry signal as
  // TEMPFAIL first so it isn't shadowed by the checks below.
  const rateLimitExhausted = rateLimit !== undefined && rateLimit.remaining <= 0;
  if (status === 429 || status >= 500 || retryAfterSeconds !== undefined || rateLimitExhausted) {
    return EXIT.TEMPFAIL;
  }
  if (status === 401 || status === 403 || hasPermissionError(graphqlErrors)) return EXIT.NOPERM;
  return EXIT.UNAVAILABLE;
}

export class GitHubRequestError extends ShepherdError {
  readonly status: number;
  readonly rateLimit?: RateLimitInfo;
  readonly retryAfterSeconds?: number;
  readonly graphqlErrors?: GitHubGraphQlError[];

  constructor(
    message: string,
    opts: {
      status: number;
      rateLimit?: RateLimitInfo;
      retryAfterSeconds?: number;
      graphqlErrors?: GitHubGraphQlError[];
      /**
       * Bypasses status-based classification entirely — for callers that already
       * know the failure kind better than the HTTP status can express (e.g. a
       * response that failed to parse at all, which is an internal failure, not
       * an availability or permission problem).
       */
      exitCodeOverride?: number;
    },
  ) {
    super(
      message,
      opts.exitCodeOverride ??
        classifyStatus(opts.status, opts.rateLimit, opts.retryAfterSeconds, opts.graphqlErrors),
    );
    this.name = "GitHubRequestError";
    this.status = opts.status;
    this.rateLimit = opts.rateLimit;
    this.retryAfterSeconds = opts.retryAfterSeconds;
    this.graphqlErrors = opts.graphqlErrors;
  }
}
