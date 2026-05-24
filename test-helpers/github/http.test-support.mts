import { vi, beforeEach } from "vitest";

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

import {
  GitHubRequestError,
  graphql,
  graphqlWithRateLimit,
  rest,
  restText,
  _resetTokenCache,
} from "../../src/github/http.mts";

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

// ---------------------------------------------------------------------------
// Token resolution
// ---------------------------------------------------------------------------

export function registerHooks(): void {
  beforeEach(() => {
    mockFetch.mockReset();
    mockExecFile.mockReset();
    _resetTokenCache();
    delete process.env["GH_TOKEN"];
    delete process.env["GITHUB_TOKEN"];
    delete process.env["GITHUB_PERSONAL_ACCESS_TOKEN"];
  });
}

export {
  GitHubRequestError,
  _resetTokenCache,
  gqlOk,
  graphql,
  graphqlWithRateLimit,
  jsonOk,
  mockExecFile,
  mockFetch,
  rest,
  restText,
};
