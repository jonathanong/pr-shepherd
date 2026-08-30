import { describe, it, expect, beforeEach } from "vitest";
import { registerHooks, gqlOk, mockFetch } from "../../test-helpers/github/http.test-support.mts";
import { GitHubRequestError, graphqlWithRateLimit } from "./http.mts";

registerHooks();

describe("graphqlWithRateLimit — header parsing", () => {
  beforeEach(() => {
    process.env["GH_TOKEN"] = "tok";
  });

  it("returns rateLimit when headers are present", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        "content-type": "application/json",
        "x-ratelimit-remaining": "42",
        "x-ratelimit-limit": "5000",
        "x-ratelimit-reset": "1700000000",
      }),
      json: () => Promise.resolve({ data: {} }),
    });
    const result = await graphqlWithRateLimit("{ q }");
    expect(result.rateLimit).toEqual({
      resource: "graphql",
      remaining: 42,
      limit: 5000,
      resetAt: 1700000000,
    });
  });

  it("uses response headers for quota state and the GraphQL rateLimit object for exact query cost", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        "content-type": "application/json",
        "x-ratelimit-resource": "graphql",
        "x-ratelimit-used": "103",
        "x-ratelimit-remaining": "4897",
        "x-ratelimit-limit": "5000",
        "x-ratelimit-reset": "1700000000",
      }),
      json: () =>
        Promise.resolve({
          data: {
            _shepherdRateLimit: {
              cost: 7,
              limit: 9999,
              nodeCount: 21,
              remaining: 9998,
              resetAt: "2023-11-14T22:13:20Z",
              used: 1,
            },
          },
        }),
    });

    const result = await graphqlWithRateLimit("{ q }");
    expect(result.rateLimit).toEqual({
      resource: "graphql",
      used: 103,
      remaining: 4897,
      limit: 5000,
      resetAt: 1700000000,
      cost: 7,
      nodeCount: 21,
    });
  });

  it("returns retry-after and GraphQL errors on partial data", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "retry-after": "30" }),
      json: () =>
        Promise.resolve({
          data: { m0: null },
          errors: [{ message: "You have exceeded a secondary rate limit" }],
        }),
    });
    const result = await graphqlWithRateLimit("{ q }", {}, { allowPartialData: true });
    expect(result.retryAfterSeconds).toBe(30);
    expect(result.errors).toEqual([{ message: "You have exceeded a secondary rate limit" }]);
  });

  it("throws GitHubRequestError with rate-limit metadata on failed response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Headers({
        "retry-after": "60",
        "x-ratelimit-remaining": "0",
        "x-ratelimit-limit": "5000",
        "x-ratelimit-reset": "1700000000",
        "x-ratelimit-used": "5001",
        "x-ratelimit-resource": "graphql",
      }),
      text: () => Promise.resolve("API rate limit exceeded"),
    });

    await expect(graphqlWithRateLimit("{ q }")).rejects.toMatchObject({
      name: "GitHubRequestError",
      status: 403,
      retryAfterSeconds: 60,
      rateLimit: {
        remaining: 0,
        limit: 5000,
        resetAt: 1700000000,
        used: 5001,
        resource: "graphql",
      },
    } satisfies Partial<GitHubRequestError>);
  });

  it("returns rateLimit: undefined when rate-limit headers are absent", async () => {
    mockFetch.mockResolvedValue(gqlOk({}));
    const result = await graphqlWithRateLimit("{ q }");
    expect(result.rateLimit).toBeUndefined();
  });

  it("returns rateLimit: undefined when rate-limit headers contain non-numeric values", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        "content-type": "application/json",
        "x-ratelimit-remaining": "not-a-number",
        "x-ratelimit-limit": "5000",
        "x-ratelimit-reset": "1700000000",
      }),
      json: () => Promise.resolve({ data: {} }),
    });
    const result = await graphqlWithRateLimit("{ q }");
    expect(result.rateLimit).toBeUndefined();
  });

  it("ignores invalid retry-after values", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "retry-after": "-1" }),
      json: () => Promise.resolve({ data: {} }),
    });
    const result = await graphqlWithRateLimit("{ q }");
    expect(result.retryAfterSeconds).toBeUndefined();
  });
});
