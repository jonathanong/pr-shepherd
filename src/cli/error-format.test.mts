import { describe, expect, it } from "vitest";
import { GitHubRequestError } from "../github/errors.mts";
import { formatCliError } from "./error-format.mts";

describe("formatCliError", () => {
  it("surfaces authoritative quota and credential details", () => {
    const error = new GitHubRequestError("GitHub GraphQL error", {
      status: 200,
      authSource: "gh auth token",
      rateLimit: {
        resource: "graphql",
        limit: 5_000,
        used: 5_002,
        remaining: 0,
        resetAt: 1_788_066_749,
      },
    });
    expect(formatCliError(error)).toBe(
      "GitHub GraphQL error (resource graphql; remaining 0/5000; used 5002; reset 2026-08-30T05:12:29.000Z; credential gh auth token)",
    );
  });
});
