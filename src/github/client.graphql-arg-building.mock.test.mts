import { describe, it, expect } from "vitest";
import {
  mockFetch,
  gqlOk,
  registerClientHooks,
} from "../../test-helpers/github/client.test-support.mts";
import { graphql } from "./client.mts";

registerClientHooks();

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
