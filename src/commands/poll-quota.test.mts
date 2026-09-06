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

  it("honors Retry-After and caps at two minutes", () => {
    expect(
      pollGraphQlRetryAfterMs(
        new GitHubRequestError("secondary rate limit", { status: 403, retryAfterSeconds: 15 }),
      ),
    ).toBe(15_000);
    expect(
      pollGraphQlRetryAfterMs(
        new GitHubRequestError("secondary rate limit", { status: 403, retryAfterSeconds: 500 }),
      ),
    ).toBe(120_000);
  });

  it("defaults to 60s for a 429 without Retry-After", () => {
    expect(pollGraphQlRetryAfterMs(new GitHubRequestError("rate limit", { status: 429 }))).toBe(
      60_000,
    );
  });
});
