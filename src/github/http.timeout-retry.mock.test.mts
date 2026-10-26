import { describe, it, expect, beforeEach, vi } from "vitest";
import { registerHooks, mockFetch, gqlOk } from "../../test-helpers/github/http.test-support.mts";
import { graphql } from "./http.mts";

vi.mock("./github-timeouts.mts", () => ({
  GITHUB_API_TIMEOUT_MS: 20,
  GITHUB_LOG_TIMEOUT_MS: 20,
}));

registerHooks();

beforeEach(() => {
  process.env["GH_TOKEN"] = "test-token";
});

function hang(_url: unknown, init: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  });
}

describe("request deadline through the retry path", () => {
  it("retries a stalled request and succeeds on the next attempt", async () => {
    mockFetch.mockImplementationOnce(hang).mockResolvedValueOnce(gqlOk({ ok: true }));
    const result = await graphql<{ ok: boolean }>("{ ok }");
    expect(result.data).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("surfaces a clear timeout error after retries are exhausted", async () => {
    mockFetch.mockImplementation(hang);
    await expect(graphql("{ ok }")).rejects.toThrow(/GitHub request timed out after 0.02s: POST/);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
