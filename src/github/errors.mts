import type { RateLimitInfo } from "./http.mts";

export interface GitHubGraphQlError {
  message: string;
  path?: unknown;
}

export class GitHubRequestError extends Error {
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
    super(message);
    this.name = "GitHubRequestError";
    this.status = opts.status;
    this.rateLimit = opts.rateLimit;
    this.retryAfterSeconds = opts.retryAfterSeconds;
    this.graphqlErrors = opts.graphqlErrors;
  }
}
