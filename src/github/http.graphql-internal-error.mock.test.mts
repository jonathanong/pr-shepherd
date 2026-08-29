import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { registerHooks, mockFetch, gqlOk } from "../../test-helpers/github/http.test-support.mts";
import { graphql } from "./http.mts";
import { GitHubRequestError } from "./errors.mts";
import { EXIT } from "../exit-codes.mts";

registerHooks();

beforeEach(() => {
  vi.useFakeTimers();
  process.env["GH_TOKEN"] = "tok";
});

afterEach(() => {
  vi.useRealTimers();
});

const BATCHPR_INTERNAL = {
  data: null,
  errors: [
    {
      message:
        "Something went wrong while executing your query on 2026-08-29T06:55:45Z. Please include `D8D9:242C07:434A6C:5437E7:6A928270` when reporting this issue.",
      type: "INTERNAL",
      extensions: { code: "INTERNAL" },
    },
  ],
};

function gqlJson(payload: unknown, extraHeaders: Record<string, string> = {}) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json", ...extraHeaders }),
    json: () => Promise.resolve(payload),
  };
}

describe("graphql — GitHub INTERNAL engine crash", () => {
  it("retries BatchPr-style HTTP 200 data:null INTERNAL then succeeds", async () => {
    mockFetch
      .mockResolvedValueOnce(gqlJson(BATCHPR_INTERNAL))
      .mockResolvedValueOnce(gqlOk({ ok: true }));

    const promise = graphql("{ BatchPr }");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.data).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws EX_TEMPFAIL after INTERNAL retries are exhausted", async () => {
    mockFetch.mockResolvedValue(gqlJson(BATCHPR_INTERNAL));

    const promise = graphql("{ BatchPr }");
    const expectReject = expect(promise).rejects.toMatchObject({
      name: "GitHubRequestError",
      status: 200,
      exitCode: EXIT.TEMPFAIL,
      graphqlErrors: [
        expect.objectContaining({
          type: "INTERNAL",
          message: expect.stringContaining("Something went wrong"),
        }),
      ],
    });
    await vi.runAllTimersAsync();
    await expectReject;
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry an unrelated GraphQL field error", async () => {
    mockFetch.mockResolvedValue(
      gqlJson({ data: null, errors: [{ message: "Variable $id has an invalid value" }] }),
    );

    await expect(graphql("{ q }")).rejects.toBeInstanceOf(GitHubRequestError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("preserves type and extensions.code from a GitHub INTERNAL payload", async () => {
    mockFetch.mockResolvedValue(gqlJson(BATCHPR_INTERNAL));

    const promise = graphql("{ BatchPr }").catch((err: unknown) => err);
    await vi.runAllTimersAsync();
    const err = await promise;
    expect(err).toMatchObject({
      graphqlErrors: [
        {
          type: "INTERNAL",
          extensions: { code: "INTERNAL" },
        },
      ],
    });
  });

  it("does not retry INTERNAL on a mutation document", async () => {
    mockFetch.mockResolvedValue(gqlJson(BATCHPR_INTERNAL));

    await expect(graphql("mutation BulkApply { x }")).rejects.toMatchObject({
      exitCode: EXIT.TEMPFAIL,
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry INTERNAL when Retry-After is present", async () => {
    mockFetch.mockResolvedValue(gqlJson(BATCHPR_INTERNAL, { "retry-after": "30" }));

    await expect(graphql("{ BatchPr }")).rejects.toMatchObject({
      exitCode: EXIT.TEMPFAIL,
      retryAfterSeconds: 30,
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry INTERNAL when the rate limit is exhausted", async () => {
    mockFetch.mockResolvedValue(
      gqlJson(BATCHPR_INTERNAL, {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-limit": "5000",
        "x-ratelimit-reset": "1700000000",
      }),
    );

    await expect(graphql("{ BatchPr }")).rejects.toMatchObject({
      exitCode: EXIT.TEMPFAIL,
      rateLimit: { remaining: 0, limit: 5000, resetAt: 1700000000 },
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
