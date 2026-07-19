import { describe, it, expect } from "vitest";
import { registerHooks, gqlOk, mockFetch } from "../../test-helpers/github/http.test-support.mts";
import { graphql } from "./http.mts";

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

  it("preserves GraphQL errors when a request-error response omits data", async () => {
    process.env["GH_TOKEN"] = "tok";
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: () =>
        Promise.resolve({
          errors: [{ message: "Variable $id has an invalid value", path: ["query", "node"] }],
        }),
    });

    await expect(graphql("{ q }")).rejects.toMatchObject({
      name: "GitHubRequestError",
      message: expect.stringContaining("Variable $id has an invalid value (path: query.node)"),
      graphqlErrors: [expect.objectContaining({ message: "Variable $id has an invalid value" })],
    });
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

  it("throws a typed error with the GraphQL path when partial data includes errors", async () => {
    process.env["GH_TOKEN"] = "tok";
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: () =>
        Promise.resolve({
          data: { node: { id: "PR_1" } },
          errors: [
            {
              message: "Resource not accessible by personal access token",
              path: ["repository", "pullRequest", "commits", 0, "commit", "statusCheckRollup"],
            },
          ],
        }),
    });
    await expect(graphql("{ q }")).rejects.toMatchObject({
      name: "GitHubRequestError",
      status: 200,
      message: expect.stringContaining(
        "path: repository.pullRequest.commits.0.commit.statusCheckRollup",
      ),
      graphqlErrors: [
        expect.objectContaining({ message: "Resource not accessible by personal access token" }),
      ],
    });
  });

  it("throws a typed error when a successful response is not valid JSON", async () => {
    process.env["GH_TOKEN"] = "tok";
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: () => Promise.reject(new SyntaxError("Unexpected token")),
    });
    await expect(graphql("{ q }")).rejects.toMatchObject({
      name: "GitHubRequestError",
      status: 200,
      message: expect.stringContaining("was not valid JSON"),
    });
  });

  it.each([
    [null, "expected a JSON object"],
    [{ errors: [] }, "missing data field"],
    [{ data: "unexpected" }, "data field is not an object or null"],
    [{ data: {}, errors: [{ path: ["node"] }] }, "errors field is not an array"],
  ])("throws a typed error for malformed payload %#", async (payload, message) => {
    process.env["GH_TOKEN"] = "tok";
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: () => Promise.resolve(payload),
    });
    await expect(graphql("{ q }")).rejects.toMatchObject({
      name: "GitHubRequestError",
      status: 200,
      message: expect.stringContaining(message),
    });
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
