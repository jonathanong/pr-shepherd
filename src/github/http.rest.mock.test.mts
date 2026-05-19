import { describe, it, expect, beforeEach } from "vitest";
import { registerHooks, jsonOk, mockFetch } from "./http.test-support.mts";
import { rest } from "./http.mts";

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
