import { describe, expect, it } from "vitest";
import { GitHubRequestError } from "../github/errors.mts";
import { pollRateLimitRetryAfterMs, quotaPollIntervalMs } from "./poll-quota.mts";

const BANDS = [
  { remainingPercent: 30, pollIntervalMinutes: 2 },
  { remainingPercent: 20, pollIntervalMinutes: 5 },
  { remainingPercent: 10, pollIntervalMinutes: 10 },
];

const MAX_MS = 2 ** 31 - 1;

function graphql(remaining: number, limit = 5000) {
  return { graphql: { remaining, limit } };
}

describe("quotaPollIntervalMs", () => {
  it("keeps the configured interval when remaining is above every band", () => {
    expect(quotaPollIntervalMs(BANDS, graphql(4000), 60_000, MAX_MS)).toBe(60_000);
  });

  it("uses the tightest crossed band when it exceeds --interval", () => {
    expect(quotaPollIntervalMs(BANDS, graphql(1200), 60_000, MAX_MS)).toBe(120_000);
    expect(quotaPollIntervalMs(BANDS, graphql(900), 60_000, MAX_MS)).toBe(300_000);
    expect(quotaPollIntervalMs(BANDS, graphql(400), 60_000, MAX_MS)).toBe(600_000);
  });

  it("uses the lowest remainingPercent band when crossed intervals are not monotonic", () => {
    const bands = [
      { remainingPercent: 40, pollIntervalMinutes: 20 },
      { remainingPercent: 5, pollIntervalMinutes: 1 },
    ];
    expect(quotaPollIntervalMs(bands, graphql(200), 60_000, MAX_MS)).toBe(60_000);
    expect(quotaPollIntervalMs(bands, graphql(1500), 60_000, MAX_MS)).toBe(1_200_000);
  });

  it("picks the lowest remainingPercent even when bands are unsorted", () => {
    const bands = [
      { remainingPercent: 10, pollIntervalMinutes: 10 },
      { remainingPercent: 30, pollIntervalMinutes: 2 },
    ];
    expect(quotaPollIntervalMs(bands, graphql(400), 60_000, MAX_MS)).toBe(600_000);
  });

  it("does not shrink an already-longer --interval", () => {
    expect(quotaPollIntervalMs(BANDS, graphql(1200), 180_000, MAX_MS)).toBe(180_000);
  });

  it("uses the tighter of GraphQL and REST core", () => {
    expect(
      quotaPollIntervalMs(
        BANDS,
        {
          graphql: { remaining: 4000, limit: 5000 },
          rest: [{ resource: "core", remaining: 400, limit: 5000 }],
        },
        60_000,
        MAX_MS,
      ),
    ).toBe(600_000);
  });

  it("ignores missing usage, empty bands, and a zero limit", () => {
    expect(quotaPollIntervalMs(BANDS, undefined, 60_000, MAX_MS)).toBe(60_000);
    expect(quotaPollIntervalMs([], graphql(1), 60_000, MAX_MS)).toBe(60_000);
    expect(quotaPollIntervalMs(BANDS, graphql(1, 0), 60_000, MAX_MS)).toBe(60_000);
  });
});

describe("pollRateLimitRetryAfterMs", () => {
  it("returns null for non-rate-limit errors", () => {
    expect(pollRateLimitRetryAfterMs(new Error("boom"))).toBeNull();
    expect(
      pollRateLimitRetryAfterMs(new GitHubRequestError("not found", { status: 404 })),
    ).toBeNull();
  });

  it("reports secondary for Retry-After and 429 without a resource", () => {
    expect(
      pollRateLimitRetryAfterMs(
        new GitHubRequestError("secondary rate limit", { status: 403, retryAfterSeconds: 15 }),
      ),
    ).toEqual({ ms: 15_000, resource: "secondary" });
    expect(
      pollRateLimitRetryAfterMs(
        new GitHubRequestError("secondary rate limit", { status: 403, retryAfterSeconds: 500 }),
      ),
    ).toEqual({ ms: 500_000, resource: "secondary" });
    expect(
      pollRateLimitRetryAfterMs(new GitHubRequestError("rate limit", { status: 429 })),
    ).toEqual({ ms: 60_000, resource: "secondary" });
    expect(
      pollRateLimitRetryAfterMs(
        new GitHubRequestError("ok", {
          status: 200,
          graphqlErrors: [{ message: "secondary rate limit" }],
        }),
      ),
    ).toEqual({ ms: 60_000, resource: "secondary" });
    expect(
      pollRateLimitRetryAfterMs(
        new GitHubRequestError("secondary rate limit", { status: 403, retryAfterSeconds: 0 }),
      ),
    ).toEqual({ ms: 0, resource: "secondary" });
  });

  it("reports graphql when a GraphQL primary limit is exhausted", () => {
    const resetAt = Math.floor(Date.now() / 1000) + 180;
    const retry = pollRateLimitRetryAfterMs(
      new GitHubRequestError("API rate limit exceeded", {
        status: 403,
        rateLimit: { resource: "graphql", remaining: 0, limit: 5000, resetAt },
      }),
    );
    expect(retry?.resource).toBe("graphql");
    expect(retry?.ms).toBeGreaterThan(170_000);
    expect(retry?.remaining).toBe(0);
    expect(retry?.limit).toBe(5000);
  });

  it("reports core for a REST 403 with remaining 0", () => {
    const resetAt = Math.floor(Date.now() / 1000) + 180;
    const retry = pollRateLimitRetryAfterMs(
      new GitHubRequestError("API rate limit exceeded", {
        status: 403,
        rateLimit: { resource: "core", remaining: 0, limit: 5000, resetAt },
      }),
    );
    expect(retry?.resource).toBe("core");
    expect(retry?.ms).toBeGreaterThan(170_000);
    expect(retry?.resetAt).toBe(resetAt);
  });

  it("waits until resetAt when remaining is 0 without a rate-limit message", () => {
    const resetAt = Math.floor(Date.now() / 1000) + 180;
    const retry = pollRateLimitRetryAfterMs(
      new GitHubRequestError("forbidden", {
        status: 403,
        rateLimit: { remaining: 0, limit: 5000, resetAt },
      }),
    );
    expect(retry?.resource).toBe("graphql");
    expect(retry?.ms).toBeGreaterThan(170_000);
  });

  it("does not wait on an already-elapsed resetAt", () => {
    expect(
      pollRateLimitRetryAfterMs(
        new GitHubRequestError("forbidden", {
          status: 403,
          rateLimit: { remaining: 0, limit: 5000, resetAt: 0 },
        }),
      )?.ms,
    ).toBe(0);
  });
});
