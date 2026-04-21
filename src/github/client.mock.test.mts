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

describe("graphql — arg building", () => {
  it("sends query as JSON body to /graphql", async () => {
    mockFetch.mockResolvedValue(gqlOk({ repository: null }));
    await graphql("{ q }", { owner: "acme", repo: "widget" });
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/graphql");
    const body = JSON.parse(init.body as string) as { variables: Record<string, unknown> };
    expect(body.variables).toMatchObject({ owner: "acme", repo: "widget" });
  });

  it("includes string vars in variables", async () => {
    mockFetch.mockResolvedValue(gqlOk({}));
    await graphql("{ q }", { owner: "acme", repo: "widget" });
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { variables: Record<string, unknown> };
    expect(body.variables["owner"]).toBe("acme");
  });

  it("includes number vars in variables", async () => {
    mockFetch.mockResolvedValue(gqlOk({}));
    await graphql("{ q }", { pr: 42 });
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { variables: Record<string, unknown> };
    expect(body.variables["pr"]).toBe(42);
  });

  it("embeds the query string in the body", async () => {
    mockFetch.mockResolvedValue(gqlOk({}));
    await graphql("query MyQ { viewer { login } }");
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { query: string };
    expect(body.query).toContain("query MyQ");
  });
});

// ---------------------------------------------------------------------------
// graphql — error handling
// ---------------------------------------------------------------------------

describe("graphql — error handling", () => {
  it("throws when response contains errors[]", async () => {
    mockFetch.mockResolvedValue(
      gqlErrors([{ message: "Field does not exist" }, { message: "Syntax error" }]),
    );
    await expect(graphql("{ q }")).rejects.toThrow("Field does not exist; Syntax error");
  });

  it("wraps fetch failure as 'GitHub GraphQL request failed'", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      text: () => Promise.resolve("Unauthorized"),
    });
    const err = await graphql("{ q }").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/GitHub GraphQL request failed: 401/);
  });
});

// ---------------------------------------------------------------------------
// graphqlWithRateLimit — header parsing
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

// ---------------------------------------------------------------------------
// getRepoInfo — remote URL parsing
// ---------------------------------------------------------------------------

describe("getRepoInfo — remote URL parsing", () => {
  it("parses git@github.com:owner/repo.git", async () => {
    mockExecFile.mockResolvedValue({ stdout: "git@github.com:owner/repo.git\n", stderr: "" });
    expect(await getRepoInfo()).toEqual({ owner: "owner", name: "repo" });
  });

  it("parses https://github.com/owner/repo.git", async () => {
    mockExecFile.mockResolvedValue({ stdout: "https://github.com/owner/repo.git\n", stderr: "" });
    expect(await getRepoInfo()).toEqual({ owner: "owner", name: "repo" });
  });

  it("parses https://github.com/owner/repo (no .git)", async () => {
    mockExecFile.mockResolvedValue({ stdout: "https://github.com/owner/repo\n", stderr: "" });
    expect(await getRepoInfo()).toEqual({ owner: "owner", name: "repo" });
  });

  it("parses ssh://git@github.com/owner/repo.git", async () => {
    mockExecFile.mockResolvedValue({
      stdout: "ssh://git@github.com/owner/repo.git\n",
      stderr: "",
    });
    expect(await getRepoInfo()).toEqual({ owner: "owner", name: "repo" });
  });
});

// ---------------------------------------------------------------------------
// getCurrentPrNumber
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

// ---------------------------------------------------------------------------
// getMergeableState
// ---------------------------------------------------------------------------

describe("getMergeableState", () => {
  it("maps REST true/clean to MERGEABLE/CLEAN", async () => {
    mockFetch.mockResolvedValue(restOk({ mergeable: true, mergeable_state: "clean" }));
    const result = await getMergeableState(42, "owner", "repo");
    expect(result).toEqual({ mergeable: "MERGEABLE", mergeStateStatus: "CLEAN" });
  });

  it("maps REST false/dirty to CONFLICTING/DIRTY", async () => {
    mockFetch.mockResolvedValue(restOk({ mergeable: false, mergeable_state: "dirty" }));
    const result = await getMergeableState(42, "owner", "repo");
    expect(result).toEqual({ mergeable: "CONFLICTING", mergeStateStatus: "DIRTY" });
  });

  it("maps REST null to UNKNOWN", async () => {
    mockFetch.mockResolvedValue(restOk({ mergeable: null, mergeable_state: "unknown" }));
    const result = await getMergeableState(42, "owner", "repo");
    expect(result).toEqual({ mergeable: "UNKNOWN", mergeStateStatus: "UNKNOWN" });
  });
});

// ---------------------------------------------------------------------------
// getPrHeadSha
// ---------------------------------------------------------------------------

describe("getPrHeadSha", () => {
  it("returns head.sha from REST response", async () => {
    mockFetch.mockResolvedValue(restOk({ head: { sha: "abc123def456" } }));
    const sha = await getPrHeadSha(42, "owner", "repo");
    expect(sha).toBe("abc123def456");
  });
});
