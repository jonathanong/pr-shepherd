/* eslint-disable max-lines */
import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubRequestError } from "../github/errors.mts";
import { exhaustedPrimaryLimitDelayMs } from "./poll-rate-limit-delay.mts";
import {
  carryQuotaWarning,
  pollRateLimitRetryAfterMs,
  quotaPollIntervalMs,
} from "./poll-quota.mts";

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

  it("ignores stale GraphQL usage after REST becomes the active transport", () => {
    expect(
      quotaPollIntervalMs(
        BANDS,
        {
          graphql: { remaining: 400, limit: 5000 },
          rest: [{ resource: "core", remaining: 4000, limit: 5000 }],
        },
        60_000,
        MAX_MS,
        "rest",
      ),
    ).toBe(60_000);
  });

  it("still throttles on low REST core in REST mode", () => {
    expect(
      quotaPollIntervalMs(
        BANDS,
        {
          graphql: { remaining: 4000, limit: 5000 },
          rest: [{ resource: "core", remaining: 400, limit: 5000 }],
        },
        60_000,
        MAX_MS,
        "rest",
      ),
    ).toBe(600_000);
  });

  it("keeps GraphQL-mode cadence based on both reported budgets", () => {
    expect(
      quotaPollIntervalMs(
        BANDS,
        {
          graphql: { remaining: 400, limit: 5000 },
          rest: [{ resource: "core", remaining: 4000, limit: 5000 }],
        },
        60_000,
        MAX_MS,
        "graphql",
      ),
    ).toBe(600_000);
  });

  it("ignores missing usage, empty bands, and a zero limit", () => {
    expect(quotaPollIntervalMs(BANDS, undefined, 60_000, MAX_MS)).toBe(60_000);
    expect(quotaPollIntervalMs([], graphql(1), 60_000, MAX_MS)).toBe(60_000);
    expect(quotaPollIntervalMs(BANDS, graphql(1, 0), 60_000, MAX_MS)).toBe(60_000);
  });
});

describe("carryQuotaWarning", () => {
  it("drops stale GraphQL warnings after REST fallback but retains a REST core warning", () => {
    const graphqlWarning = {
      resource: "graphql" as const,
      thresholdPercent: 10,
      remaining: 400,
      limit: 5000,
      resetAt: 1_700_000_000,
      pollIntervalMinutes: 10,
      pollTimeoutMinutes: 20,
    };
    const coreWarning = { ...graphqlWarning, resource: "core" as const };
    expect(carryQuotaWarning(graphqlWarning, undefined, "rest")).toBeUndefined();
    expect(carryQuotaWarning(coreWarning, undefined, "rest")).toBe(coreWarning);
    expect(carryQuotaWarning(graphqlWarning, undefined, "graphql")).toBe(graphqlWarning);
  });
});

describe("pollRateLimitRetryAfterMs", () => {
  afterEach(() => vi.restoreAllMocks());

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
    ).toEqual({ ms: 60_000, resource: "secondary", kind: "secondary" });
    expect(
      pollRateLimitRetryAfterMs(
        new GitHubRequestError("secondary rate limit", { status: 403, retryAfterSeconds: 500 }),
      ),
    ).toEqual({ ms: 500_000, resource: "secondary", kind: "secondary" });
    expect(
      pollRateLimitRetryAfterMs(new GitHubRequestError("rate limit", { status: 429 })),
    ).toEqual({ ms: 60_000, resource: "secondary", kind: "secondary" });
    expect(
      pollRateLimitRetryAfterMs(
        new GitHubRequestError("ok", {
          status: 200,
          graphqlErrors: [{ message: "secondary rate limit" }],
        }),
      ),
    ).toEqual({ ms: 60_000, resource: "secondary", kind: "secondary" });
    expect(
      pollRateLimitRetryAfterMs(
        new GitHubRequestError("secondary rate limit", { status: 403, retryAfterSeconds: 0 }),
      ),
    ).toEqual({ ms: 60_000, resource: "secondary", kind: "secondary" });
  });

  it("keeps an explicit secondary throttle separate from the reported GraphQL budget", () => {
    const rateLimit = { resource: "graphql", remaining: 4800, limit: 5000, resetAt: 1700000180 };
    for (const status of [200, 403]) {
      const error = new GitHubRequestError("GitHub GraphQL error: secondary rate limit", {
        status,
        rateLimit,
        ...(status === 200 && { graphqlErrors: [{ message: "secondary rate limit" }] }),
      });
      expect(error.exitCode).toBe(75);
      expect(pollRateLimitRetryAfterMs(error)).toMatchObject({
        kind: "secondary",
        resource: "secondary",
        ms: 60_000,
      });
    }
  });

  it("treats a 429 with an empty primary bucket as primary unless GitHub names secondary", () => {
    const rateLimit = { resource: "graphql", remaining: 0, limit: 5000, resetAt: 1700000180 };
    expect(
      pollRateLimitRetryAfterMs(
        new GitHubRequestError("API rate limit exceeded", { status: 429, rateLimit }),
      )?.kind,
    ).toBe("primary");
    expect(
      pollRateLimitRetryAfterMs(
        new GitHubRequestError("secondary rate limit", { status: 429, rateLimit }),
      )?.kind,
    ).toBe("secondary");
  });

  it("adds a 5s margin and resetAt % 5 seconds when a primary limit is exhausted", () => {
    const now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const resetAt = 1_700_000_183;
    const retry = pollRateLimitRetryAfterMs(
      new GitHubRequestError("API rate limit exceeded", {
        status: 403,
        rateLimit: { resource: "graphql", remaining: 0, limit: 5000, resetAt },
      }),
    );
    expect(retry).toEqual({
      kind: "primary",
      resource: "graphql",
      remaining: 0,
      limit: 5000,
      resetAt,
      ms: Math.max(resetAt * 1000 - now, 0) + 5000 + (resetAt % 5) * 1000,
    });
    expect(retry?.ms).toBe(exhaustedPrimaryLimitDelayMs(resetAt, now));
    expect(resetAt % 5).not.toBe(0);
  });

  it("reports core for a REST 403 with remaining 0", () => {
    const now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const resetAt = 1_700_000_180;
    const retry = pollRateLimitRetryAfterMs(
      new GitHubRequestError("API rate limit exceeded", {
        status: 403,
        rateLimit: { resource: "core", remaining: 0, limit: 5000, resetAt },
      }),
    );
    expect(retry?.resource).toBe("core");
    expect(retry?.resetAt).toBe(resetAt);
    expect(retry?.ms).toBe(exhaustedPrimaryLimitDelayMs(resetAt, now));
  });

  it("waits until resetAt when remaining is 0 without a rate-limit message", () => {
    const now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const resetAt = 1_700_000_180;
    const retry = pollRateLimitRetryAfterMs(
      new GitHubRequestError("forbidden", {
        status: 403,
        rateLimit: { remaining: 0, limit: 5000, resetAt },
      }),
    );
    expect(retry?.resource).toBe("graphql");
    expect(retry?.ms).toBe(exhaustedPrimaryLimitDelayMs(resetAt, now));
  });

  it("still adds the margin when resetAt is already in the past", () => {
    const now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    expect(
      pollRateLimitRetryAfterMs(
        new GitHubRequestError("forbidden", {
          status: 403,
          rateLimit: { remaining: 0, limit: 5000, resetAt: 0 },
        }),
      )?.ms,
    ).toBe(exhaustedPrimaryLimitDelayMs(0, now));
    expect(exhaustedPrimaryLimitDelayMs(0, now)).toBe(5_000);
  });
});
