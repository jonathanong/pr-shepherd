import { describe, it, expect } from "vitest";
import {
  mockFetch,
  mockExecFile,
  gqlOk,
  restOk,
  registerClientHooks,
} from "../../test-helpers/github/client.test-support.mts";
import { getCurrentPrNumber, getPrNumberForBranch } from "./client.mts";
import { runWithGithubTransport } from "./transport.mts";

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

  it("infers a fork head when origin points to the base repository in REST mode", async () => {
    mockExecFile
      .mockResolvedValueOnce({ stdout: "my-branch\n", stderr: "" })
      .mockResolvedValueOnce({ stdout: "https://github.com/owner/repo.git\n", stderr: "" });
    mockFetch.mockResolvedValue(
      restOk([
        { number: 123, head: { ref: "my-branch", repo: { full_name: "contributor/fork" } } },
      ]),
    );
    expect(await runWithGithubTransport("rest", getCurrentPrNumber)).toBe(123);
    expect(mockFetch.mock.calls[0]?.[0]).toContain("/repos/owner/repo/pulls?state=open");
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
