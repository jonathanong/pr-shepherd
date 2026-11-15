import { describe, it, expect } from "vitest";
import {
  mockFetch,
  gqlErrors,
  registerClientHooks,
} from "../../test-helpers/github/client.test-support.mts";
import { graphql } from "./client.mts";

registerClientHooks();

describe("graphql — error handling", () => {
  it("throws when response contains errors[]", async () => {
    mockFetch.mockResolvedValue(
      gqlErrors([{ message: "Field does not exist" }, { message: "Syntax error" }]),
    );
    await expect(graphql("{ q }")).rejects.toThrow("Field does not exist; Syntax error");
  });

  it("returns partial data when the only error is an unreadable check-suite app", async () => {
    const data = { repository: { checkSuites: { nodes: [{ id: "S1", app: null }] } } };
    const errors = [
      { message: "IP allow list", path: ["repository", "checkSuites", "nodes", 0, "app"] },
    ];
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: () => Promise.resolve({ data, errors }),
      text: () => Promise.resolve(JSON.stringify({ data, errors })),
    });
    await expect(graphql("{ q }")).resolves.toEqual({ data, errors: undefined });
  });

  it("still throws when another error comes with a tolerated one", async () => {
    const data = { repository: { checkSuites: { nodes: [{ id: "S1", app: null }] } } };
    const errors = [
      { message: "IP allow list", path: ["repository", "checkSuites", "nodes", 0, "app"] },
      { message: "Something else", path: ["repository", "pullRequest"] },
    ];
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: () => Promise.resolve({ data, errors }),
      text: () => Promise.resolve(JSON.stringify({ data, errors })),
    });
    const err = await graphql("{ q }").catch((e: unknown) => e);
    expect((err as Error).message).toBe(
      "GitHub GraphQL error: Something else (path: repository.pullRequest)",
    );
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
