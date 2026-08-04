import { EXIT, ShepherdError } from "../exit-codes.mts";
import type { RateLimitInfo } from "./http.mts";

export interface GitHubGraphQlError {
  message: string;
  path?: unknown;
}

function classifyStatus(status: number, rateLimit?: RateLimitInfo, retryAfterSeconds?: number) {
  // Retry signals take priority over the raw status: GitHub's secondary rate limit
  // returns 403 with a Retry-After header, which is a transient throttle — not the
  // permission-denied 403 a bad/missing token produces. Treat any retry signal as
  // TEMPFAIL first so it isn't shadowed by the blanket 401/403 -> NOPERM check below.
  const rateLimitExhausted = rateLimit !== undefined && rateLimit.remaining <= 0;
  if (status === 429 || status >= 500 || retryAfterSeconds !== undefined || rateLimitExhausted) {
    return EXIT.TEMPFAIL;
  }
  if (status === 401 || status === 403) return EXIT.NOPERM;
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
    },
  ) {
    super(message, classifyStatus(opts.status, opts.rateLimit, opts.retryAfterSeconds));
    this.name = "GitHubRequestError";
    this.status = opts.status;
    this.rateLimit = opts.rateLimit;
    this.retryAfterSeconds = opts.retryAfterSeconds;
    this.graphqlErrors = opts.graphqlErrors;
  }
}
