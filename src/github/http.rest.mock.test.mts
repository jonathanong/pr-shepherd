import { describe, it, expect, beforeEach } from "vitest";
import { registerHooks, jsonOk, mockFetch } from "../../test-helpers/github/http.test-support.mts";
import { rest, restWithRateLimit } from "./http.mts";

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
  });

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
  });
});
