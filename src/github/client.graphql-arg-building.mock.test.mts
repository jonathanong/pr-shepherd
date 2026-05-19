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

import { graphql } from "./client.mts";
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
