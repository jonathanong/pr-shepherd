// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerHooks, gqlOk, graphql, mockFetch } from "./http.test-support.mts";

registerHooks();

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

  it("throws on a GraphQL null data payload without errors", async () => {
    process.env["GH_TOKEN"] = "tok";
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: () => Promise.resolve({ data: null }),
    });
    await expect(graphql("{ q }")).rejects.toThrow(/GitHub GraphQL error \(no data\)/);
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
