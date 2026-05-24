import { describe, it, expect } from "vitest";
import {
  mockFetch,
  gqlOk,
  registerClientHooks,
} from "../../test-helpers/github/client.test-support.mts";
import { graphqlWithRateLimit } from "./client.mts";

registerClientHooks();

describe("graphqlWithRateLimit — header parsing", () => {
  it("parses x-ratelimit-* response headers", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        "content-type": "application/json",
        "x-ratelimit-remaining": "50",
        "x-ratelimit-limit": "5000",
        "x-ratelimit-reset": "1700000000",
      }),
      json: () => Promise.resolve({ data: {} }),
    });
    const result = await graphqlWithRateLimit("{ q }");
    expect(result.rateLimit).toEqual({ remaining: 50, limit: 5000, resetAt: 1700000000 });
  });

  it("returns rateLimit: undefined when no rate-limit headers present", async () => {
    mockFetch.mockResolvedValue(gqlOk({}));
    const result = await graphqlWithRateLimit("{ q }");
    expect(result.rateLimit).toBeUndefined();
  });
});
