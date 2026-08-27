import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./client.mts", () => ({
  graphql: vi.fn(),
}));

import { graphql } from "./client.mts";
import { fetchSuggestionThreads } from "./suggestion-thread.mts";
import { SUGGESTION_THREADS_QUERY } from "./queries.mts";

const mockGraphql = vi.mocked(graphql);
const REPO = { owner: "owner", name: "repo" };

function threadNode(id = "PRRT_x", prNumber = 42) {
  return {
    id,
    isResolved: false,
    isOutdated: false,
    path: "src/foo.ts",
    line: 5,
    startLine: null,
    pullRequest: { number: prNumber },
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

describe("fetchSuggestionThreads", () => {
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
        nodes: [threadNode()],
      },
    });
    const result = await fetchSuggestionThreads(42, REPO, ["PRRT_x"]);
    expect(result.headRefOid).toBe("abc");
    expect(result.threads[0]?.author).toBe("alice");
    expect(result.threads[0]?.authorType).toBe("User");
    expect(mockGraphql).toHaveBeenCalledWith(SUGGESTION_THREADS_QUERY, {
      owner: "owner",
      repo: "repo",
      pr: 42,
      threadIds: ["PRRT_x"],
    });
  });

  it("throws when the PR is missing", async () => {
    mockGraphql.mockResolvedValue({
      data: { repository: { pullRequest: null }, nodes: [] },
    });
    await expect(fetchSuggestionThreads(42, REPO, ["PRRT_x"])).rejects.toThrow("PR #42 not found");
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
        nodes: [null],
      },
    });
    const result = await fetchSuggestionThreads(42, REPO, ["PRRT_x"]);
    expect(result.threads[0]).toBeNull();
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
        nodes: [threadNode("PRRT_other")],
      },
    });
    const result = await fetchSuggestionThreads(42, REPO, ["PRRT_x"]);
    expect(result.headRepoWithOwner).toBeNull();
    expect(result.threads[0]).toBeNull();
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
        nodes: [
          {
            id: "PRRT_x",
            isResolved: false,
            isOutdated: false,
            pullRequest: { number: 42 },
            comments: { nodes: [{}] },
          },
        ],
      },
    });
    const result = await fetchSuggestionThreads(42, REPO, ["PRRT_x"]);
    expect(result.threads[0]).toMatchObject({
      isMinimized: false,
      path: null,
      line: null,
      startLine: null,
      author: "unknown",
      body: "",
      url: "",
      createdAtUnix: 0,
    });
    expect(result.threads[0]?.authorAssociation).toBeUndefined();
  });

  it("returns a null thread when the node belongs to another PR", async () => {
    mockGraphql.mockResolvedValue({
      data: {
        repository: {
          pullRequest: {
            headRefOid: "abc",
            headRefName: "feature",
            headRepository: { nameWithOwner: "owner/repo" },
          },
        },
        nodes: [threadNode("PRRT_x", 99)],
      },
    });
    const result = await fetchSuggestionThreads(42, REPO, ["PRRT_x"]);
    expect(result.threads[0]).toBeNull();
  });

  it("returns requested threads in caller order", async () => {
    mockGraphql.mockResolvedValue({
      data: {
        repository: {
          pullRequest: {
            headRefOid: "abc",
            headRefName: "feature",
            headRepository: { nameWithOwner: "owner/repo" },
          },
        },
        nodes: [threadNode("PRRT_two"), threadNode("PRRT_one")],
      },
    });
    const result = await fetchSuggestionThreads(42, REPO, ["PRRT_one", "PRRT_two"]);
    expect(result.threads.map((thread) => thread?.id)).toEqual(["PRRT_one", "PRRT_two"]);
  });
});
