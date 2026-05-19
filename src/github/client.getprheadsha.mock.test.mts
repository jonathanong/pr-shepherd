import { describe, it, expect } from "vitest";
import { mockFetch, gqlOk, registerClientHooks } from "./client.test-support.mts";
import { getPrHeadSha } from "./client.mts";

registerClientHooks();

describe("getPrHeadSha", () => {
  it("returns headRefOid from GraphQL response", async () => {
    mockFetch.mockResolvedValue(
      gqlOk({ repository: { pullRequest: { headRefOid: "abc123def456" } } }),
    );
    const sha = await getPrHeadSha(42, "owner", "repo");
    expect(sha).toBe("abc123def456");
  });

  it("throws 'repository not found or access denied' when repository is null", async () => {
    mockFetch.mockResolvedValue(gqlOk({ repository: null }));
    await expect(getPrHeadSha(42, "owner", "repo")).rejects.toThrow(
      "repository not found or access denied",
    );
  });

  it("throws 'PR not found or access denied' when pullRequest is null", async () => {
    mockFetch.mockResolvedValue(gqlOk({ repository: { pullRequest: null } }));
    await expect(getPrHeadSha(42, "owner", "repo")).rejects.toThrow(
      "PR not found or access denied",
    );
  });

  it("throws 'headRefOid missing' when headRefOid is absent", async () => {
    mockFetch.mockResolvedValue(gqlOk({ repository: { pullRequest: {} } }));
    await expect(getPrHeadSha(42, "owner", "repo")).rejects.toThrow("headRefOid missing");
  });
});
