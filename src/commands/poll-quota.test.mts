import { describe, expect, it } from "vitest";
import { GitHubRequestError } from "../github/errors.mts";
import { graphqlQuotaPollIntervalMs, pollGraphQlRetryAfterMs } from "./poll-quota.mts";

const BANDS = [
  { remainingPercent: 30, pollIntervalMinutes: 2 },
  { remainingPercent: 20, pollIntervalMinutes: 5 },
  { remainingPercent: 10, pollIntervalMinutes: 10 },
];

const MAX_MS = 2 ** 31 - 1;

describe("graphqlQuotaPollIntervalMs", () => {
  it("keeps the configured interval when remaining is above every band", () => {
    expect(
      graphqlQuotaPollIntervalMs(BANDS, { remaining: 4000, limit: 5000 }, 60_000, MAX_MS),
    ).toBe(60_000);
  });

  it("uses the tightest crossed band when it exceeds --interval", () => {
    expect(
      graphqlQuotaPollIntervalMs(BANDS, { remaining: 1200, limit: 5000 }, 60_000, MAX_MS),
    ).toBe(120_000);
    expect(graphqlQuotaPollIntervalMs(BANDS, { remaining: 900, limit: 5000 }, 60_000, MAX_MS)).toBe(
      300_000,
    );
    expect(graphqlQuotaPollIntervalMs(BANDS, { remaining: 400, limit: 5000 }, 60_000, MAX_MS)).toBe(
      600_000,
    );
  });

  it("does not shrink an already-longer --interval", () => {
    expect(
      graphqlQuotaPollIntervalMs(BANDS, { remaining: 1200, limit: 5000 }, 180_000, MAX_MS),
    ).toBe(180_000);
  });

  it("ignores missing usage, empty bands, and a zero limit", () => {
    expect(graphqlQuotaPollIntervalMs(BANDS, undefined, 60_000, MAX_MS)).toBe(60_000);
    expect(graphqlQuotaPollIntervalMs([], { remaining: 1, limit: 5000 }, 60_000, MAX_MS)).toBe(
      60_000,
    );
    expect(graphqlQuotaPollIntervalMs(BANDS, { remaining: 1, limit: 0 }, 60_000, MAX_MS)).toBe(
      60_000,
    );
  });
});

describe("pollGraphQlRetryAfterMs", () => {
  it("returns null for non-rate-limit errors", () => {
    expect(pollGraphQlRetryAfterMs(new Error("boom"))).toBeNull();
    expect(
      pollGraphQlRetryAfterMs(new GitHubRequestError("not found", { status: 404 })),
    ).toBeNull();
  });

  it("honors Retry-After without shortening an explicit delay", () => {
    expect(
      pollGraphQlRetryAfterMs(
        new GitHubRequestError("secondary rate limit", { status: 403, retryAfterSeconds: 15 }),
      ),
    ).toBe(15_000);
    expect(
      pollGraphQlRetryAfterMs(
        new GitHubRequestError("secondary rate limit", { status: 403, retryAfterSeconds: 500 }),
      ),
    ).toBe(500_000);
  });

  it("waits until GraphQL remaining resets when Retry-After is absent", () => {
    const resetAt = Math.floor(Date.now() / 1000) + 180;
    expect(
      pollGraphQlRetryAfterMs(
        new GitHubRequestError("API rate limit exceeded", {
          status: 403,
          rateLimit: { remaining: 0, limit: 5000, resetAt },
        }),
      ),
    ).toBeGreaterThan(170_000);
  });

  it("waits until resetAt when remaining is 0 without a rate-limit message", () => {
    const resetAt = Math.floor(Date.now() / 1000) + 180;
    expect(
      pollGraphQlRetryAfterMs(
        new GitHubRequestError("forbidden", {
          status: 403,
          rateLimit: { remaining: 0, limit: 5000, resetAt },
        }),
      ),
    ).toBeGreaterThan(170_000);
  });

  it("does not wait on an already-elapsed GraphQL resetAt", () => {
    expect(
      pollGraphQlRetryAfterMs(
        new GitHubRequestError("forbidden", {
          status: 403,
          rateLimit: { remaining: 0, limit: 5000, resetAt: 0 },
        }),
      ),
    ).toBe(0);
  });

  it("retries GraphQL error payloads that mention a secondary limit", () => {
    expect(
      pollGraphQlRetryAfterMs(
        new GitHubRequestError("ok", {
          status: 200,
          graphqlErrors: [{ message: "secondary rate limit" }],
        }),
      ),
    ).toBe(60_000);
  });

  it("defaults to 60s for a 429 without Retry-After", () => {
    expect(pollGraphQlRetryAfterMs(new GitHubRequestError("rate limit", { status: 429 }))).toBe(
      60_000,
    );
  });

  it("clamps a zero Retry-After to zero milliseconds", () => {
    expect(
      pollGraphQlRetryAfterMs(
        new GitHubRequestError("secondary rate limit", { status: 403, retryAfterSeconds: 0 }),
      ),
    ).toBe(0);
  });
});
