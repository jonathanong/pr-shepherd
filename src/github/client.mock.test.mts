import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoist mock BEFORE any imports so node:child_process is replaced before
// client.mts captures execFile via promisify().
// ---------------------------------------------------------------------------

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
} from "./client.mts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ghJson(data: unknown): { stdout: string } {
  return { stdout: JSON.stringify({ data }) };
}

function ghJsonErrors(errors: Array<{ message: string }>): { stdout: string } {
  return { stdout: JSON.stringify({ data: null, errors }) };
}

beforeEach(() => {
  mockExecFile.mockReset();
});

// ---------------------------------------------------------------------------
// graphql — argument building
// ---------------------------------------------------------------------------

describe("graphql — arg building", () => {
  it("passes string vars with -f", async () => {
    mockExecFile.mockResolvedValue(ghJson({ repository: null }));
    await graphql("{ q }", { owner: "acme", repo: "widget" });
    const [, args] = mockExecFile.mock.calls[0] as [string, string[]];
    expect(args).toContain("-f");
    expect(args).toContain("owner=acme");
    expect(args).toContain("repo=widget");
    expect(args).not.toContain("-F");
  });

  it("passes number vars with -F", async () => {
    mockExecFile.mockResolvedValue(ghJson({ repository: null }));
    await graphql("{ q }", { pr: 42 });
    const [, args] = mockExecFile.mock.calls[0] as [string, string[]];
    expect(args).toContain("-F");
    expect(args).toContain("pr=42");
  });

  it("passes boolean vars with -F", async () => {
    mockExecFile.mockResolvedValue(ghJson({}));
    await graphql("{ q }", { dry: true });
    const [, args] = mockExecFile.mock.calls[0] as [string, string[]];
    expect(args).toContain("-F");
    expect(args).toContain("dry=true");
  });

  it("embeds the query as -f query=…", async () => {
    mockExecFile.mockResolvedValue(ghJson({}));
    await graphql("query MyQ { viewer { login } }");
    const [, args] = mockExecFile.mock.calls[0] as [string, string[]];
    expect(args).toContain("query=query MyQ { viewer { login } }");
  });
});

// ---------------------------------------------------------------------------
// graphql — error handling
// ---------------------------------------------------------------------------

describe("graphql — error handling", () => {
  it("throws when response contains errors[]", async () => {
    mockExecFile.mockResolvedValue(
      ghJsonErrors([{ message: "Field does not exist" }, { message: "Syntax error" }]),
    );
    await expect(graphql("{ q }")).rejects.toThrow("Field does not exist; Syntax error");
  });

  it("wraps gh exec failure as 'gh api failed: …'", async () => {
    const cause = new Error("exit status 1");
    mockExecFile.mockRejectedValue(cause);
    const err = await graphql("{ q }").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/^gh api failed:/);
    expect((err as Error & { cause: unknown }).cause).toBe(cause);
  });
});

// ---------------------------------------------------------------------------
// graphqlWithRateLimit — header parsing
// ---------------------------------------------------------------------------

describe("graphqlWithRateLimit — header parsing", () => {
  function makeRawWithCRLF(remaining: number, limit: number, reset: number, data: unknown): string {
    const headers = [
      "HTTP/1.1 200 OK",
      `x-ratelimit-remaining: ${remaining}`,
      `x-ratelimit-limit: ${limit}`,
      `x-ratelimit-reset: ${reset}`,
    ].join("\r\n");
    return `${headers}\r\n\r\n${JSON.stringify({ data })}`;
  }

  function makeRawWithLF(remaining: number, limit: number, reset: number, data: unknown): string {
    const headers = [
      "HTTP/1.1 200 OK",
      `x-ratelimit-remaining: ${remaining}`,
      `x-ratelimit-limit: ${limit}`,
      `x-ratelimit-reset: ${reset}`,
    ].join("\n");
    return `${headers}\n\n${JSON.stringify({ data })}`;
  }

  it("parses rateLimit when headers use CRLF separator", async () => {
    mockExecFile.mockResolvedValue({ stdout: makeRawWithCRLF(50, 5000, 1700000000, {}) });
    const result = await graphqlWithRateLimit("{ q }");
    expect(result.rateLimit).toEqual({ remaining: 50, limit: 5000, resetAt: 1700000000 });
  });

  it("parses rateLimit when headers use LF separator", async () => {
    mockExecFile.mockResolvedValue({ stdout: makeRawWithLF(100, 5000, 1700000001, {}) });
    const result = await graphqlWithRateLimit("{ q }");
    expect(result.rateLimit).toEqual({ remaining: 100, limit: 5000, resetAt: 1700000001 });
  });

  it("returns rateLimit: undefined when no headers are present", async () => {
    mockExecFile.mockResolvedValue({ stdout: JSON.stringify({ data: {} }) });
    const result = await graphqlWithRateLimit("{ q }");
    expect(result.rateLimit).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getCurrentPrNumber
// ---------------------------------------------------------------------------

describe("getCurrentPrNumber", () => {
  it("returns null when branch is HEAD (detached)", async () => {
    // First call: git rev-parse
    mockExecFile.mockResolvedValueOnce({ stdout: "HEAD\n" });
    expect(await getCurrentPrNumber()).toBeNull();
  });

  it("returns null when gh pr list returns empty string", async () => {
    mockExecFile
      .mockResolvedValueOnce({ stdout: "my-branch\n" })
      .mockResolvedValueOnce({ stdout: "\n" });
    expect(await getCurrentPrNumber()).toBeNull();
  });

  it("returns null when gh pr list returns 'null'", async () => {
    mockExecFile
      .mockResolvedValueOnce({ stdout: "my-branch\n" })
      .mockResolvedValueOnce({ stdout: "null\n" });
    expect(await getCurrentPrNumber()).toBeNull();
  });

  it("returns PR number on success", async () => {
    mockExecFile
      .mockResolvedValueOnce({ stdout: "my-branch\n" })
      .mockResolvedValueOnce({ stdout: "123\n" });
    expect(await getCurrentPrNumber()).toBe(123);
  });

  it("returns null when any exec call throws", async () => {
    mockExecFile.mockRejectedValue(new Error("not authenticated"));
    expect(await getCurrentPrNumber()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getMergeableState
// ---------------------------------------------------------------------------

describe("getMergeableState", () => {
  it("returns parsed mergeable and mergeStateStatus", async () => {
    const payload = { mergeable: "MERGEABLE", mergeStateStatus: "CLEAN" };
    mockExecFile.mockResolvedValue({ stdout: JSON.stringify(payload) });
    const result = await getMergeableState(42, "owner", "repo");
    expect(result).toEqual(payload);
  });
});

// ---------------------------------------------------------------------------
// getPrHeadSha
// ---------------------------------------------------------------------------

describe("getPrHeadSha", () => {
  it("trims whitespace from stdout", async () => {
    mockExecFile.mockResolvedValue({ stdout: "  abc123def456  \n" });
    const sha = await getPrHeadSha(42, "owner", "repo");
    expect(sha).toBe("abc123def456");
  });
});
