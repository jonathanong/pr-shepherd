// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Stub fetch globally so http.mts uses our mock.
// child_process is still used by client.mts for `git` calls, so mock those too.
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { mockExecFile } = vi.hoisted(() => ({ mockExecFile: vi.fn() }));

vi.mock("node:child_process", () => ({
  execFile: (
    cmd: string,
    args: string[],
    optsOrCb:
      | Record<string, unknown>
      | ((err: Error | null, result: { stdout: string; stderr: string }) => void),
    maybeCb?: (err: Error | null, result: { stdout: string; stderr: string }) => void,
  ) => {
    const cb = typeof optsOrCb === "function" ? optsOrCb : maybeCb!;
    mockExecFile(cmd, args)
      .then((result: { stdout: string; stderr: string }) => cb(null, result))
      .catch((err: Error) => cb(err, { stdout: "", stderr: "" }));
  },
}));

import {
  graphql,
  graphqlWithRateLimit,
  getCurrentPrNumber,
  getMergeableState,
  getPrHeadSha,
  getRepoInfo,
} from "./client.mts";
import { _resetTokenCache } from "./http.mts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function gqlOk(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({
      "content-type": "application/json",
    }),
    json: () => Promise.resolve({ data }),
    text: () => Promise.resolve(JSON.stringify({ data })),
  } as unknown as Response;
}

function gqlErrors(errors: Array<{ message: string }>): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve({ data: null, errors }),
    text: () => Promise.resolve(JSON.stringify({ data: null, errors })),
  } as unknown as Response;
}

function restOk(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as unknown as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
  mockExecFile.mockReset();
  _resetTokenCache();
  process.env["GH_TOKEN"] = "test-token";
});

// ---------------------------------------------------------------------------
// graphql — argument building
// ---------------------------------------------------------------------------

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
