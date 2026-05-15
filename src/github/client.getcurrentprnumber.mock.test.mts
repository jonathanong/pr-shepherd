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
  getPrNumberForBranch,
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

describe("getCurrentPrNumber", () => {
  it("returns null when branch is HEAD (detached)", async () => {
    mockExecFile.mockResolvedValueOnce({ stdout: "HEAD\n", stderr: "" });
    expect(await getCurrentPrNumber()).toBeNull();
  });

  it("returns null when GraphQL returns no PR for branch", async () => {
    mockExecFile
      .mockResolvedValueOnce({ stdout: "my-branch\n", stderr: "" }) // rev-parse
      .mockResolvedValueOnce({ stdout: "https://github.com/owner/repo.git\n", stderr: "" }); // remote get-url
    mockFetch.mockResolvedValue(gqlOk({ repository: { pullRequests: { nodes: [] } } }));
    expect(await getCurrentPrNumber()).toBeNull();
  });

  it("returns PR number on success", async () => {
    mockExecFile
      .mockResolvedValueOnce({ stdout: "my-branch\n", stderr: "" }) // rev-parse
      .mockResolvedValueOnce({ stdout: "https://github.com/owner/repo.git\n", stderr: "" }); // remote get-url
    mockFetch.mockResolvedValue(
      gqlOk({ repository: { pullRequests: { nodes: [{ number: 123 }] } } }),
    );
    expect(await getCurrentPrNumber()).toBe(123);
  });

  it("returns null when any call throws", async () => {
    mockExecFile.mockRejectedValue(new Error("not authenticated"));
    expect(await getCurrentPrNumber()).toBeNull();
  });
});

describe("getPrNumberForBranch", () => {
  it("returns PR number on success", async () => {
    mockFetch.mockResolvedValue(
      gqlOk({ repository: { pullRequests: { nodes: [{ number: 77 }] } } }),
    );
    expect(await getPrNumberForBranch("my-branch", "owner", "repo")).toBe(77);
  });

  it("returns null when GraphQL call throws", async () => {
    mockFetch.mockRejectedValue(new Error("network error"));
    expect(await getPrNumberForBranch("my-branch", "owner", "repo")).toBeNull();
  });
});
