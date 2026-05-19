import { describe, it, expect } from "vitest";
import { registerHooks, gqlOk, mockExecFile, mockFetch } from "./http.test-support.mts";
import { graphql } from "./http.mts";

registerHooks();

describe("token resolution", () => {
  it("uses GH_TOKEN when set", async () => {
    process.env["GH_TOKEN"] = "my-gh-token";
    mockFetch.mockResolvedValue(gqlOk({}));
    await graphql("{ q }");
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer my-gh-token");
  });

  it("falls back to GITHUB_TOKEN when GH_TOKEN is absent", async () => {
    process.env["GITHUB_TOKEN"] = "my-github-token";
    mockFetch.mockResolvedValue(gqlOk({}));
    await graphql("{ q }");
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer my-github-token",
    );
  });

  it("falls back to `gh auth token` when no env var is set", async () => {
    mockExecFile.mockResolvedValue({ stdout: "fallback-token\n", stderr: "" });
    mockFetch.mockResolvedValue(gqlOk({}));
    await graphql("{ q }");
    expect(mockExecFile).toHaveBeenCalledWith("gh", ["auth", "token"]);
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer fallback-token");
  });

  it("prefers `gh auth token` over GITHUB_PERSONAL_ACCESS_TOKEN", async () => {
    process.env["GITHUB_PERSONAL_ACCESS_TOKEN"] = "codex-token";
    mockExecFile.mockResolvedValue({ stdout: "fallback-token\n", stderr: "" });
    mockFetch.mockResolvedValue(gqlOk({}));
    await graphql("{ q }");
    expect(mockExecFile).toHaveBeenCalledWith("gh", ["auth", "token"]);
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer fallback-token");
  });

  it("falls back to GITHUB_PERSONAL_ACCESS_TOKEN when `gh auth token` is unavailable", async () => {
    process.env["GITHUB_PERSONAL_ACCESS_TOKEN"] = "codex-token";
    mockExecFile.mockRejectedValue(new Error("not authenticated"));
    mockFetch.mockResolvedValue(gqlOk({}));
    await graphql("{ q }");
    expect(mockExecFile).toHaveBeenCalledWith("gh", ["auth", "token"]);
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer codex-token");
  });

  it("falls back to GITHUB_PERSONAL_ACCESS_TOKEN when `gh auth token` is empty", async () => {
    process.env["GITHUB_PERSONAL_ACCESS_TOKEN"] = "codex-token";
    mockExecFile.mockResolvedValue({ stdout: "\n", stderr: "" });
    mockFetch.mockResolvedValue(gqlOk({}));
    await graphql("{ q }");
    expect(mockExecFile).toHaveBeenCalledWith("gh", ["auth", "token"]);
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer codex-token");
  });

  it("throws a helpful error when no token is available", async () => {
    mockExecFile.mockRejectedValue(new Error("not authenticated"));
    await expect(graphql("{ q }")).rejects.toThrow(/No GitHub token found/);
  });

  it("caches the resolved token across calls", async () => {
    process.env["GH_TOKEN"] = "cached-token";
    mockFetch.mockResolvedValue(gqlOk({}));
    await graphql("{ q }");
    await graphql("{ q }");
    // execFile should never be called — token came from env
    expect(mockExecFile).not.toHaveBeenCalled();
  });
});
