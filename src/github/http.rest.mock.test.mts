/* eslint-disable max-lines */
import { describe, it, expect, beforeEach } from "vitest";
import { registerHooks, jsonOk, mockFetch } from "../../test-helpers/github/http.test-support.mts";
import { _resetTokenCache, rest, restWithRateLimit } from "./http.mts";
import { pollRateLimitRetryAfterMs } from "../commands/poll-quota.mts";
import { withApiTelemetryScope, withRestCoreCredentialFingerprint } from "./api-telemetry.mts";
import { credentialFingerprint } from "./http-auth.mts";

registerHooks();

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

  it("sends a JSON request body when provided", async () => {
    mockFetch.mockResolvedValue(jsonOk({ ok: true }));
    await rest("POST", "/repos/o/r/dispatches", { event_type: "test" });
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(JSON.stringify({ event_type: "test" }));
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

  it("records retry attempt metadata when a retried rest request still fails", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers(),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        text: () => Promise.resolve("Unauthorized"),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: new Headers(),
        text: () => Promise.resolve("server error"),
      });

    await expect(rest("GET", "/repos/o/r")).rejects.toThrow(/500/);
  });
});

describe("rest — path validation", () => {
  it.each([
    ["missing leading slash", "repos/o/r", "Invalid GitHub REST path"],
    ["absolute URL", "https://evil.example/repos/o/r", "Invalid GitHub REST path"],
    ["parent segment", "/repos/o/../secret", "Invalid GitHub REST path"],
    ["dot segment", "/repos/./r", "Invalid GitHub REST path"],
    ["protocol-relative", "//evil.example/repos/o/r", "Invalid GitHub REST URL origin"],
  ])("rejects %s before fetch", async (_label, path, message) => {
    await expect(rest("GET", path)).rejects.toThrow(message);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("allows consecutive dots inside a path component", async () => {
    process.env["GH_TOKEN"] = "tok";
    mockFetch.mockResolvedValue(jsonOk({ id: 1 }));
    await expect(rest("GET", "/repos/acme/widgets..js/pulls/1")).resolves.toEqual({ id: 1 });
  });
});

describe("restWithRateLimit", () => {
  beforeEach(() => {
    process.env["GH_TOKEN"] = "tok";
  });

  it("returns parsed JSON and rate-limit headers", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        "content-type": "application/json",
        "x-ratelimit-remaining": "42",
        "x-ratelimit-limit": "5000",
        "x-ratelimit-reset": "99",
      }),
      json: () => Promise.resolve({ id: 1 }),
    });
    const result = await restWithRateLimit<{ id: number }>("GET", "/repos/o/r/pulls/1");
    expect(result.data).toEqual({ id: 1 });
    expect(result.rateLimit).toEqual({ remaining: 42, limit: 5000, resetAt: 99 });
    expect(result.status).toBe(200);
  });

  it("retains accepted non-2xx status and wraps malformed accepted error JSON", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      headers: new Headers({ "content-type": "application/json" }),
      json: () => Promise.resolve({ message: "already merged" }),
    });
    const accepted = await restWithRateLimit<{ message: string }>(
      "PUT",
      "/repos/o/r/pulls/1/merge",
      { sha: "abc" },
      { acceptStatuses: [409] },
    );
    expect(accepted).toMatchObject({ status: 409, data: { message: "already merged" } });

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      headers: new Headers({ "content-type": "application/json" }),
      json: () => Promise.reject(new SyntaxError("unexpected token")),
    });
    await expect(
      restWithRateLimit(
        "PUT",
        "/repos/o/r/pulls/1/merge",
        { sha: "abc" },
        {
          acceptStatuses: [400],
        },
      ),
    ).rejects.toMatchObject({
      status: 400,
      responseMessage: "Invalid JSON response: unexpected token",
    });
  });

  it("does not classify a repository path containing rate-limit as a secondary throttle", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Headers({
        "x-ratelimit-resource": "core",
        "x-ratelimit-remaining": "4900",
        "x-ratelimit-limit": "5000",
        "x-ratelimit-reset": "99",
      }),
      text: () => Promise.resolve("Resource not accessible by integration"),
    });
    const error = await restWithRateLimit("GET", "/repos/acme/rate-limit/actions/runs").then(
      () => null,
      (failure: unknown) => failure,
    );
    expect(error).toMatchObject({
      exitCode: 77,
      responseMessage: "Resource not accessible by integration",
    });
    expect(pollRateLimitRetryAfterMs(error)).toBeNull();
  });

  it.each([404, 422])(
    "does not turn a %i response mentioning rate limits into a throttle",
    async (status) => {
      mockFetch.mockResolvedValue({
        ok: false,
        status,
        headers: new Headers({
          "x-ratelimit-resource": "core",
          "x-ratelimit-remaining": "4900",
          "x-ratelimit-limit": "5000",
          "x-ratelimit-reset": "99",
        }),
        text: () => Promise.resolve("Validation text mentions a rate limit setting"),
      });
      const error = await restWithRateLimit("GET", "/repos/acme/widgets/actions/runs").then(
        () => null,
        (failure: unknown) => failure,
      );
      expect(error).toMatchObject({ exitCode: 69 });
      expect(pollRateLimitRetryAfterMs(error)).toBeNull();
    },
  );

  it("returns undefined data when there is no JSON content-type", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      headers: new Headers({
        "x-ratelimit-remaining": "1",
        "x-ratelimit-limit": "5000",
        "x-ratelimit-reset": "99",
      }),
      text: () => Promise.resolve(""),
    });
    const result = await restWithRateLimit("POST", "/repos/o/r/actions/runs/1/cancel");
    expect(result.data).toBeUndefined();
    expect(result.rateLimit?.remaining).toBe(1);
    expect(result.status).toBe(204);
  });

  it("records REST credential fingerprints and adopts a new token's higher core quota", async () => {
    const headers = (remaining: string) =>
      new Headers({
        "content-type": "application/json",
        "x-ratelimit-resource": "core",
        "x-ratelimit-remaining": remaining,
        "x-ratelimit-limit": "5000",
        "x-ratelimit-reset": "99",
        "x-ratelimit-used": `${5000 - Number(remaining)}`,
      });
    process.env["GH_TOKEN"] = "old-rest-token";
    _resetTokenCache();
    mockFetch
      .mockImplementationOnce(async () => {
        process.env["GH_TOKEN"] = "new-rest-token";
        return {
          ok: false,
          status: 401,
          headers: headers("500"),
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        } as unknown as Response;
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: headers("4900"),
        json: () => Promise.resolve({ id: 2 }),
      } as unknown as Response);

    await withApiTelemetryScope(async () => {
      await restWithRateLimit("GET", "/repos/o/r/second");

      expect(withRestCoreCredentialFingerprint({ remaining: 4900 })).toEqual({
        remaining: 4900,
        credentialFingerprint: credentialFingerprint("new-rest-token"),
      });
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
