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

import { getPrHeadSha } from "./client.mts";
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

describe("getPrHeadSha", () => {
  it("returns headRefOid from GraphQL response", async () => {
    mockFetch.mockResolvedValue(
      gqlOk({ repository: { pullRequest: { headRefOid: "abc123def456" } } }),
    );
    const sha = await getPrHeadSha(42, "owner", "repo");
    expect(sha).toBe("abc123def456");
  });

  it("throws 'repository not found or access denied' when repository is null", async () => {
    mockFetch.mockResolvedValue(gqlOk({ repository: null }));
    await expect(getPrHeadSha(42, "owner", "repo")).rejects.toThrow(
      "repository not found or access denied",
    );
  });

  it("throws 'PR not found or access denied' when pullRequest is null", async () => {
    mockFetch.mockResolvedValue(gqlOk({ repository: { pullRequest: null } }));
    await expect(getPrHeadSha(42, "owner", "repo")).rejects.toThrow(
      "PR not found or access denied",
    );
  });

  it("throws 'headRefOid missing' when headRefOid is absent", async () => {
    mockFetch.mockResolvedValue(gqlOk({ repository: { pullRequest: {} } }));
    await expect(getPrHeadSha(42, "owner", "repo")).rejects.toThrow("headRefOid missing");
  });
});
