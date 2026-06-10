import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { registerHooks, mockFetch, gqlOk } from "../../test-helpers/github/http.test-support.mts";
import { graphql } from "./http.mts";

registerHooks();

beforeEach(() => {
  vi.useFakeTimers();
  process.env["GH_TOKEN"] = "test-token";
});

afterEach(() => {
  vi.useRealTimers();
});

describe("fetchWithTransportRetry", () => {
  it("retries on transport error then succeeds", async () => {
    mockFetch
      .mockRejectedValueOnce(Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }))
      .mockResolvedValueOnce(gqlOk({ viewer: { login: "alice" } }));

    const promise = graphql<{ viewer: { login: string } }>("{ viewer { login } }");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.data).toEqual({ viewer: { login: "alice" } });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws after retries exhausted", async () => {
    const err = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
    mockFetch.mockRejectedValueOnce(err).mockRejectedValueOnce(err).mockRejectedValueOnce(err);

    const promise = expect(graphql("{ viewer { login } }")).rejects.toThrow("read ECONNRESET");
    await vi.runAllTimersAsync();
    await promise;
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-transport errors", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("oops"));

    await expect(graphql("{ viewer { login } }")).rejects.toThrow("oops");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries when cause.code is a transport error code", async () => {
    const cause = Object.assign(new Error("connect timeout"), {
      code: "UND_ERR_CONNECT_TIMEOUT",
    });
    const wrapper = Object.assign(new Error("fetch failed"), { cause });
    mockFetch
      .mockRejectedValueOnce(wrapper)
      .mockResolvedValueOnce(gqlOk({ viewer: { login: "bob" } }));

    const promise = graphql<{ viewer: { login: string } }>("{ viewer { login } }");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.data).toEqual({ viewer: { login: "bob" } });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
