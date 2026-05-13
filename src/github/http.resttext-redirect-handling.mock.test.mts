// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerHooks, mockFetch } from "./http.test-support.mts";
import { restText } from "./http.mts";

registerHooks();

describe("restText — redirect handling", () => {
  beforeEach(() => {
    process.env["GH_TOKEN"] = "tok";
  });

  it("follows 302 redirect and returns text from redirect target", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 302,
        headers: new Headers({ location: "https://storage.example.com/logs/job-1.txt" }),
        text: () => Promise.resolve(""),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: () => Promise.resolve("log content here"),
      });
    const text = await restText("/repos/o/r/actions/jobs/1/logs");
    expect(text).toBe("log content here");
  });

  it("returns text directly for 200 responses", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: () => Promise.resolve("direct log content"),
    });
    const text = await restText("/repos/o/r/actions/jobs/1/logs");
    expect(text).toBe("direct log content");
  });

  it("handles direct text responses with invalid content-length", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-length": "not-a-number" }),
      text: () => Promise.resolve("direct log content"),
    });
    await expect(restText("/repos/o/r/actions/jobs/1/logs")).resolves.toBe("direct log content");
  });

  it("handles redirect target responses with valid content-length", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 302,
        headers: new Headers({ location: "https://storage.example.com/logs/job-1.txt" }),
        text: () => Promise.resolve(""),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-length": "11" }),
        text: () => Promise.resolve("hello world"),
      });
    await expect(restText("/repos/o/r/actions/jobs/1/logs")).resolves.toBe("hello world");
  });

  it("falls through redirects with no location and throws the original response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 302,
      headers: new Headers(),
      text: () => Promise.resolve("missing location"),
    });
    await expect(restText("/repos/o/r/actions/jobs/1/logs")).rejects.toThrow(/failed: 302/);
  });

  it("throws when redirect target returns non-2xx", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 302,
        headers: new Headers({ location: "https://storage.example.com/logs/job-1.txt" }),
        text: () => Promise.resolve(""),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        headers: new Headers(),
        text: () => Promise.resolve("Forbidden"),
      });
    await expect(restText("/repos/o/r/actions/jobs/1/logs")).rejects.toThrow(
      /redirect target.*failed: 403/,
    );
  });

  it("logs and attempts invalid redirect locations without URL parsing", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 302,
      headers: new Headers({ location: "%%%" }),
      text: () => Promise.resolve(""),
    });
    mockFetch.mockRejectedValueOnce(new TypeError("Invalid URL"));

    await expect(restText("/repos/o/r/actions/jobs/1/logs")).rejects.toThrow("Invalid URL");
  });

  it("throws on non-2xx non-redirect responses", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers(),
      text: () => Promise.resolve("Not Found"),
    });
    await expect(restText("/repos/o/r/actions/jobs/1/logs")).rejects.toThrow(
      /GitHub REST GET.*failed: 404/,
    );
  });

  it("retries on 401 and returns text after token refresh", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers(),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        text: () => Promise.resolve("Unauthorized"),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: () => Promise.resolve("log content"),
      });
    const text = await restText("/repos/o/r/actions/jobs/1/logs");
    expect(text).toBe("log content");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
