import { EXIT, ShepherdError } from "../exit-codes.mts";
import type { RateLimitInfo } from "./http.mts";

export interface GitHubGraphQlError {
  message: string;
  path?: unknown;
  /** GitHub's GraphQL `type` field — `INTERNAL` on engine crashes. */
  type?: string;
  /** GraphQL `extensions`; GitHub often sets `{ code: "INTERNAL" }`. */
  extensions?: unknown;
}

// GitHub's GraphQL API reports field-level permission failures (e.g. a fine-grained
// PAT missing a scope) as an `errors[].message` entry at HTTP 200, not as an HTTP
// 401/403 — the transport-level request succeeded even though one field could not
// be resolved. Status alone can't see this, so classification must also inspect the
// GraphQL error messages themselves.
const GRAPHQL_PERMISSION_ERROR = /resource not accessible/i;
const GRAPHQL_INTERNAL_MESSAGE = /something went wrong while executing your query/i;
const GRAPHQL_RESOURCE_LIMIT_MESSAGE = /resource limits for this query exceeded/i;

function isToken(value: unknown, token: string): boolean {
  return typeof value === "string" && value.toUpperCase() === token;
}

function extensionsCode(extensions: unknown): unknown {
  if (typeof extensions !== "object" || extensions === null || Array.isArray(extensions)) {
    return undefined;
  }
  return (extensions as Record<string, unknown>)["code"];
}

function hasPermissionError(graphqlErrors?: GitHubGraphQlError[]): boolean {
  return graphqlErrors?.some((e) => GRAPHQL_PERMISSION_ERROR.test(e.message)) ?? false;
}

/** GitHub GraphQL engine crash: HTTP 200, `data: null`, INTERNAL type/code or message. */
export function isRetryableGraphQlInternal(graphqlErrors?: GitHubGraphQlError[]): boolean {
  if (!graphqlErrors?.length) return false;
  return graphqlErrors.some((error) => {
    if (isToken(error.type, "INTERNAL")) return true;
    if (isToken(extensionsCode(error.extensions), "INTERNAL")) return true;
    return GRAPHQL_INTERNAL_MESSAGE.test(error.message);
  });
}

/**
 * GitHub refused the query for size or load (`Resource limits for this query
 * exceeded`). The same document can succeed on a later attempt, and a smaller
 * page can succeed when the full one cannot.
 */
export function isRetryableGraphQlResourceLimit(graphqlErrors?: GitHubGraphQlError[]): boolean {
  if (!graphqlErrors?.length) return false;
  return graphqlErrors.some((error) => {
    if (isToken(error.type, "RESOURCE_LIMITS_EXCEEDED")) return true;
    if (isToken(extensionsCode(error.extensions), "RESOURCE_LIMITS_EXCEEDED")) return true;
    return GRAPHQL_RESOURCE_LIMIT_MESSAGE.test(error.message);
  });
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
  if (
    status === 429 ||
    status >= 500 ||
    retryAfterSeconds !== undefined ||
    rateLimitExhausted ||
    isRetryableGraphQlInternal(graphqlErrors) ||
    isRetryableGraphQlResourceLimit(graphqlErrors)
  ) {
    return EXIT.TEMPFAIL;
  }
  if (status === 401 || status === 403 || hasPermissionError(graphqlErrors)) return EXIT.NOPERM;
  return EXIT.UNAVAILABLE;
}

/** HTTP 200 GraphQL response whose `repository` field resolved to null. */
export function missingRepositoryError(repo: { owner: string; name: string }): GitHubRequestError {
  return new GitHubRequestError(
    `GitHub GraphQL response did not include repository ${repo.owner}/${repo.name} (not found or access denied)`,
    { status: 200 },
  );
}

export class GitHubRequestError extends ShepherdError {
  readonly status: number;
  readonly rateLimit?: RateLimitInfo;
  readonly retryAfterSeconds?: number;
  readonly graphqlErrors?: GitHubGraphQlError[];
  readonly authSource?: string;

  constructor(
    message: string,
    opts: {
      status: number;
      rateLimit?: RateLimitInfo;
      retryAfterSeconds?: number;
      graphqlErrors?: GitHubGraphQlError[];
      authSource?: string;
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
    this.authSource = opts.authSource;
  }
}
