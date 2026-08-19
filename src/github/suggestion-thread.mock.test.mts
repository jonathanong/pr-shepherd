import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./client.mts", () => ({
  graphql: vi.fn(),
}));

import { graphql } from "./client.mts";
import { fetchSuggestionThread } from "./suggestion-thread.mts";
import { COMMIT_SUGGESTION_THREAD_QUERY } from "./queries.mts";

const mockGraphql = vi.mocked(graphql);
const REPO = { owner: "owner", name: "repo" };

function threadNode(id = "PRRT_x") {
  return {
    id,
    isResolved: false,
    isOutdated: false,
    path: "src/foo.ts",
    line: 5,
    startLine: null,
    comments: {
      nodes: [
        {
          isMinimized: false,
          url: "https://example",
          authorAssociation: "CONTRIBUTOR" as const,
          author: { __typename: "User", login: "alice" },
          body: "```suggestion\nconst x = 1;\n```",
          path: "src/foo.ts",
          line: 5,
          startLine: null,
          createdAt: "2024-01-01T00:00:00Z",
        },
      ],
    },
  };
}

describe("fetchSuggestionThread", () => {
  beforeEach(() => {
    mockGraphql.mockReset();
  });

  it("returns PR head fields and the matching thread", async () => {
    mockGraphql.mockResolvedValue({
      data: {
        repository: {
          pullRequest: {
            headRefOid: "abc",
            headRefName: "feature",
            headRepository: { nameWithOwner: "owner/repo" },
          },
        },
        node: threadNode(),
      },
    });
    const result = await fetchSuggestionThread(42, REPO, "PRRT_x");
    expect(result.headRefOid).toBe("abc");
    expect(result.thread?.author).toBe("alice");
    expect(result.thread?.authorType).toBe("User");
    expect(mockGraphql).toHaveBeenCalledWith(COMMIT_SUGGESTION_THREAD_QUERY, {
      owner: "owner",
      repo: "repo",
      pr: 42,
      threadId: "PRRT_x",
    });
  });

  it("throws when the PR is missing", async () => {
    mockGraphql.mockResolvedValue({
      data: { repository: { pullRequest: null }, node: null },
    });
    await expect(fetchSuggestionThread(42, REPO, "PRRT_x")).rejects.toThrow("PR #42 not found");
  });

  it("returns a null thread when the node is not a review thread", async () => {
    mockGraphql.mockResolvedValue({
      data: {
        repository: {
          pullRequest: {
            headRefOid: "abc",
            headRefName: "feature",
            headRepository: { nameWithOwner: "owner/repo" },
          },
        },
        node: null,
      },
    });
    const result = await fetchSuggestionThread(42, REPO, "PRRT_x");
    expect(result.thread).toBeNull();
  });

  it("returns a null thread when the node id does not match", async () => {
    mockGraphql.mockResolvedValue({
      data: {
        repository: {
          pullRequest: {
            headRefOid: "abc",
            headRefName: "feature",
            headRepository: null,
          },
        },
        node: threadNode("PRRT_other"),
      },
    });
    const result = await fetchSuggestionThread(42, REPO, "PRRT_x");
    expect(result.headRepoWithOwner).toBeNull();
    expect(result.thread).toBeNull();
  });

  it("falls back when the original comment is sparse", async () => {
    mockGraphql.mockResolvedValue({
      data: {
        repository: {
          pullRequest: {
            headRefOid: "abc",
            headRefName: "feature",
            headRepository: { nameWithOwner: "owner/repo" },
          },
        },
        node: {
          id: "PRRT_x",
          isResolved: false,
          isOutdated: false,
          comments: { nodes: [{}] },
        },
      },
    });
    const result = await fetchSuggestionThread(42, REPO, "PRRT_x");
    expect(result.thread).toMatchObject({
      isMinimized: false,
      path: null,
      line: null,
      startLine: null,
      author: "unknown",
      body: "",
      url: "",
      createdAtUnix: 0,
    });
    expect(result.thread?.authorAssociation).toBeUndefined();
  });
});
