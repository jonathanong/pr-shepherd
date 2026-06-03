import { describe, it, expect } from "vitest";
import {
  mockFetch,
  gqlOk,
  registerClientHooks,
} from "../../test-helpers/github/client.test-support.mts";
import { getPullRequestBody, updatePullRequestBody } from "./client.mts";

registerClientHooks();

describe("getPullRequestBody", () => {
  it("returns nodeId and body from GraphQL response", async () => {
    mockFetch.mockResolvedValue(
      gqlOk({ repository: { pullRequest: { id: "PR_node1", body: "## Summary\n\nHello." } } }),
    );
    const result = await getPullRequestBody(42, "owner", "repo");
    expect(result.nodeId).toBe("PR_node1");
    expect(result.body).toBe("## Summary\n\nHello.");
  });

  it("coerces null body to empty string", async () => {
    mockFetch.mockResolvedValue(
      gqlOk({ repository: { pullRequest: { id: "PR_node2", body: null } } }),
    );
    const result = await getPullRequestBody(42, "owner", "repo");
    expect(result.body).toBe("");
  });

  it("throws when repository is null", async () => {
    mockFetch.mockResolvedValue(gqlOk({ repository: null }));
    await expect(getPullRequestBody(42, "owner", "repo")).rejects.toThrow(
      "repository not found or access denied",
    );
  });

  it("throws when pullRequest is null", async () => {
    mockFetch.mockResolvedValue(gqlOk({ repository: { pullRequest: null } }));
    await expect(getPullRequestBody(42, "owner", "repo")).rejects.toThrow(
      "PR not found or access denied",
    );
  });
});

describe("updatePullRequestBody", () => {
  it("sends updatePullRequest mutation with pullRequestId and body", async () => {
    mockFetch.mockResolvedValue(gqlOk({ updatePullRequest: { pullRequest: { id: "PR_node1" } } }));
    await updatePullRequestBody("PR_node1", "new body");
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { variables: Record<string, unknown> };
    expect(body.variables["pullRequestId"]).toBe("PR_node1");
    expect(body.variables["body"]).toBe("new body");
  });
});
