import type { RateLimitInfo } from "./http.mts";

export class GitHubRequestError extends Error {
  readonly status: number;
  readonly rateLimit?: RateLimitInfo;
  readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    opts: { status: number; rateLimit?: RateLimitInfo; retryAfterSeconds?: number },
  ) {
    super(message);
    this.name = "GitHubRequestError";
    this.status = opts.status;
    this.rateLimit = opts.rateLimit;
    this.retryAfterSeconds = opts.retryAfterSeconds;
  }
}
