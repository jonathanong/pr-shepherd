import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Stub fetch and child_process globally before any imports.
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

import { graphql, graphqlWithRateLimit, rest, restText, _resetTokenCache } from "./http.mts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonOk(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as unknown as Response;
}

function gqlOk(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve({ data }),
    text: () => Promise.resolve(JSON.stringify({ data })),
  } as unknown as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
  mockExecFile.mockReset();
  _resetTokenCache();
  delete process.env["GH_TOKEN"];
  delete process.env["GITHUB_TOKEN"];
  delete process.env["GITHUB_PERSONAL_ACCESS_TOKEN"];
});

// ---------------------------------------------------------------------------
// Token resolution
// ---------------------------------------------------------------------------

describe("token resolution", () => {
  it("uses GH_TOKEN when set", async () => {
    process.env["GH_TOKEN"] = "my-gh-token";
    mockFetch.mockResolvedValue(gqlOk({}));
    await graphql("{ q }");
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer my-gh-token");
  });

  it("falls back to GITHUB_TOKEN when GH_TOKEN is absent", async () => {
    process.env["GITHUB_TOKEN"] = "my-github-token";
    mockFetch.mockResolvedValue(gqlOk({}));
    await graphql("{ q }");
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer my-github-token",
    );
  });

  it("falls back to `gh auth token` when no env var is set", async () => {
    mockExecFile.mockResolvedValue({ stdout: "fallback-token\n", stderr: "" });
    mockFetch.mockResolvedValue(gqlOk({}));
    await graphql("{ q }");
    expect(mockExecFile).toHaveBeenCalledWith("gh", ["auth", "token"]);
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer fallback-token");
  });

  it("prefers `gh auth token` over GITHUB_PERSONAL_ACCESS_TOKEN", async () => {
    process.env["GITHUB_PERSONAL_ACCESS_TOKEN"] = "codex-token";
    mockExecFile.mockResolvedValue({ stdout: "fallback-token\n", stderr: "" });
    mockFetch.mockResolvedValue(gqlOk({}));
    await graphql("{ q }");
    expect(mockExecFile).toHaveBeenCalledWith("gh", ["auth", "token"]);
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer fallback-token");
  });

  it("falls back to GITHUB_PERSONAL_ACCESS_TOKEN when `gh auth token` is unavailable", async () => {
    process.env["GITHUB_PERSONAL_ACCESS_TOKEN"] = "codex-token";
    mockExecFile.mockRejectedValue(new Error("not authenticated"));
    mockFetch.mockResolvedValue(gqlOk({}));
    await graphql("{ q }");
    expect(mockExecFile).toHaveBeenCalledWith("gh", ["auth", "token"]);
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer codex-token");
  });

  it("falls back to GITHUB_PERSONAL_ACCESS_TOKEN when `gh auth token` is empty", async () => {
    process.env["GITHUB_PERSONAL_ACCESS_TOKEN"] = "codex-token";
    mockExecFile.mockResolvedValue({ stdout: "\n", stderr: "" });
    mockFetch.mockResolvedValue(gqlOk({}));
    await graphql("{ q }");
    expect(mockExecFile).toHaveBeenCalledWith("gh", ["auth", "token"]);
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer codex-token");
  });

  it("throws a helpful error when no token is available", async () => {
    mockExecFile.mockRejectedValue(new Error("not authenticated"));
    await expect(graphql("{ q }")).rejects.toThrow(/No GitHub token found/);
  });

  it("caches the resolved token across calls", async () => {
    process.env["GH_TOKEN"] = "cached-token";
    mockFetch.mockResolvedValue(gqlOk({}));
    await graphql("{ q }");
    await graphql("{ q }");
    // execFile should never be called — token came from env
    expect(mockExecFile).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// graphql — error handling
// ---------------------------------------------------------------------------

describe("graphql — error handling", () => {
  it("throws on non-2xx responses", async () => {
    process.env["GH_TOKEN"] = "tok";
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      text: () => Promise.resolve("Unauthorized"),
    });
    await expect(graphql("{ q }")).rejects.toThrow(/GitHub GraphQL request failed: 401/);
  });

  it("throws on GraphQL errors[] in payload", async () => {
    process.env["GH_TOKEN"] = "tok";
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: () => Promise.resolve({ data: null, errors: [{ message: "bad field" }] }),
    });
    await expect(graphql("{ q }")).rejects.toThrow(/bad field/);
  });

  it("succeeds and logs to stderr when data is present but errors[] is non-empty", async () => {
    process.env["GH_TOKEN"] = "tok";
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: () =>
        Promise.resolve({
          data: { node: { id: "PR_1" } },
          errors: [{ message: "partial failure" }],
        }),
    });
    const result = await graphql("{ q }");
    expect(result.data).toEqual({ node: { id: "PR_1" } });
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("non-fatal errors"));
    stderrSpy.mockRestore();
  });

  it("redacts bearer tokens from error response bodies", async () => {
    process.env["GH_TOKEN"] = "tok";
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
      text: () => Promise.resolve("Authorization: Bearer supersecret-token-123 caused error"),
    });
    await expect(graphql("{ q }")).rejects.toThrow("[REDACTED]");
  });

  it("retries graphql on 401 and succeeds after token refresh", async () => {
    process.env["GH_TOKEN"] = "stale-tok";
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers(),
        text: () => Promise.resolve("Unauthorized"),
      })
      .mockResolvedValueOnce(gqlOk({ id: "refreshed" }));
    const result = await graphql("{ q }");
    expect(result.data).toEqual({ id: "refreshed" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// graphqlWithRateLimit — header parsing
// ---------------------------------------------------------------------------

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
    expect(result.rateLimit).toEqual({ remaining: 42, limit: 5000, resetAt: 1700000000 });
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
});

// ---------------------------------------------------------------------------
// rest — JSON parsing and error handling
// ---------------------------------------------------------------------------

describe("rest", () => {
  beforeEach(() => {
    process.env["GH_TOKEN"] = "tok";
  });

  it("returns parsed JSON when content-type is application/json", async () => {
    mockFetch.mockResolvedValue(jsonOk({ id: 1, name: "widget" }));
    const data = await rest<{ id: number; name: string }>("GET", "/repos/o/r/pulls/1");
    expect(data).toEqual({ id: 1, name: "widget" });
  });

  it("returns undefined when no content-type header", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      headers: new Headers(),
      text: () => Promise.resolve(""),
    });
    const result = await rest("POST", "/repos/o/r/actions/runs/1/cancel");
    expect(result).toBeUndefined();
  });

  it("throws on non-2xx with method and path in message", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      headers: new Headers(),
      text: () => Promise.resolve("conflict"),
    });
    await expect(rest("POST", "/repos/o/r/actions/runs/1/cancel")).rejects.toThrow(
      /GitHub REST POST \/repos\/o\/r\/actions\/runs\/1\/cancel failed: 409/,
    );
  });

  it("retries rest on 401 and succeeds after token refresh", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers(),
        text: () => Promise.resolve("Unauthorized"),
      })
      .mockResolvedValueOnce(jsonOk({ merged: true }));
    const result = await rest<{ merged: boolean }>("PUT", "/repos/o/r/pulls/1/merge");
    expect(result).toEqual({ merged: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// restText — redirect handling
// ---------------------------------------------------------------------------

describe("restText — redirect handling", () => {
  beforeEach(() => {
    process.env["GH_TOKEN"] = "tok";
  });

  it("follows 302 redirect and returns text from redirect target", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 302,
        headers: new Headers({ location: "https://storage.example.com/logs/job-1.txt" }),
        text: () => Promise.resolve(""),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: () => Promise.resolve("log content here"),
      });
    const text = await restText("/repos/o/r/actions/jobs/1/logs");
    expect(text).toBe("log content here");
  });

  it("returns text directly for 200 responses", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: () => Promise.resolve("direct log content"),
    });
    const text = await restText("/repos/o/r/actions/jobs/1/logs");
    expect(text).toBe("direct log content");
  });

  it("throws when redirect target returns non-2xx", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 302,
        headers: new Headers({ location: "https://storage.example.com/logs/job-1.txt" }),
        text: () => Promise.resolve(""),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        headers: new Headers(),
        text: () => Promise.resolve("Forbidden"),
      });
    await expect(restText("/repos/o/r/actions/jobs/1/logs")).rejects.toThrow(
      /redirect target.*failed: 403/,
    );
  });

  it("throws on non-2xx non-redirect responses", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers(),
      text: () => Promise.resolve("Not Found"),
    });
    await expect(restText("/repos/o/r/actions/jobs/1/logs")).rejects.toThrow(
      /GitHub REST GET.*failed: 404/,
    );
  });

  it("retries on 401 and returns text after token refresh", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers(),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        text: () => Promise.resolve("Unauthorized"),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: () => Promise.resolve("log content"),
      });
    const text = await restText("/repos/o/r/actions/jobs/1/logs");
    expect(text).toBe("log content");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
