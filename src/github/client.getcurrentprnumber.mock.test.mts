import { describe, it, expect } from "vitest";
import { mockFetch, mockExecFile, gqlOk, registerClientHooks } from "./client.test-support.mts";
import { getCurrentPrNumber, getPrNumberForBranch } from "./client.mts";

registerClientHooks();

describe("getCurrentPrNumber", () => {
  it("returns null when branch is HEAD (detached)", async () => {
    mockExecFile.mockResolvedValueOnce({ stdout: "HEAD\n", stderr: "" });
    expect(await getCurrentPrNumber()).toBeNull();
  });

  it("returns null when GraphQL returns no PR for branch", async () => {
    mockExecFile
      .mockResolvedValueOnce({ stdout: "my-branch\n", stderr: "" }) // rev-parse
      .mockResolvedValueOnce({ stdout: "https://github.com/owner/repo.git\n", stderr: "" }); // remote get-url
    mockFetch.mockResolvedValue(gqlOk({ repository: { pullRequests: { nodes: [] } } }));
    expect(await getCurrentPrNumber()).toBeNull();
  });

  it("returns PR number on success", async () => {
    mockExecFile
      .mockResolvedValueOnce({ stdout: "my-branch\n", stderr: "" }) // rev-parse
      .mockResolvedValueOnce({ stdout: "https://github.com/owner/repo.git\n", stderr: "" }); // remote get-url
    mockFetch.mockResolvedValue(
      gqlOk({ repository: { pullRequests: { nodes: [{ number: 123 }] } } }),
    );
    expect(await getCurrentPrNumber()).toBe(123);
  });

  it("returns null when any call throws", async () => {
    mockExecFile.mockRejectedValue(new Error("not authenticated"));
    expect(await getCurrentPrNumber()).toBeNull();
  });
});

describe("getPrNumberForBranch", () => {
  it("returns PR number on success", async () => {
    mockFetch.mockResolvedValue(
      gqlOk({ repository: { pullRequests: { nodes: [{ number: 77 }] } } }),
    );
    expect(await getPrNumberForBranch("my-branch", "owner", "repo")).toBe(77);
  });

  it("returns null when GraphQL call throws", async () => {
    mockFetch.mockRejectedValue(new Error("network error"));
    expect(await getPrNumberForBranch("my-branch", "owner", "repo")).toBeNull();
  });
});
