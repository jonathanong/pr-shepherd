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

function gqlJson(payload: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
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
});
