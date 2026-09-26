import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client.mts", () => ({ graphqlWithRateLimit: vi.fn() }));
vi.mock("../state/seen-comments.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../state/seen-comments.mts")>();
  return { ...actual, loadSeenMap: vi.fn().mockResolvedValue(new Map()) };
});

import { EXIT } from "../exit-codes.mts";
import { graphqlWithRateLimit } from "./client.mts";
import { GitHubRequestError } from "./errors.mts";
import { fetchPollSummary } from "./poll-summary.mts";

const mockGraphql = vi.mocked(graphqlWithRateLimit);
const repo = { owner: "acme", name: "widgets" };
const sha = (number: number) => String(number).padStart(40, "0");

function member(number: number, position: number) {
  const parent = number - 1;
  return {
    position,
    pullRequest: {
      number,
      title: `PR ${number}`,
      url: `https://github.com/acme/widgets/pull/${number}`,
      state: "OPEN",
      isDraft: false,
      viewerCanUpdate: true,
      headRefName: `feature-${number}`,
      headRefOid: sha(number),
      baseRefName: position === 1 ? "main" : `feature-${parent}`,
      baseRefOid: position === 1 ? sha(1) : sha(parent),
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
      reviewDecision: null,
      isInMergeQueue: false,
      stack: null,
      stackEntry: null,
      comments: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
      reviews: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
      reviewThreads: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
      commits: { nodes: [{ commit: { statusCheckRollup: null } }] },
    },
  };
}

function stackPage(size: number, nodes: unknown[], endCursor: string | null = null) {
  return {
    data: {
      repository: {
        viewerCanAdminister: false,
        pullRequest: {
          stack: {
            id: "STACK",
            number: 9,
            size,
            baseRefName: "main",
            entries: { pageInfo: { hasNextPage: endCursor !== null, endCursor }, nodes },
          },
        },
      },
    },
  };
}

function resourceLimit(): GitHubRequestError {
  return new GitHubRequestError(
    "GitHub GraphQL error: Resource limits for this query exceeded (path: repository.pullRequest.stack.entries.nodes.1.pullRequest.commits.nodes.0.commit.statusCheckRollup.contexts.nodes.81.checkSuite)",
    {
      status: 200,
      graphqlErrors: [
        {
          message: "Resource limits for this query exceeded",
          type: "RESOURCE_LIMITS_EXCEEDED",
          path: ["repository", "pullRequest", "stack", "entries", "nodes", 1],
        },
      ],
    },
  );
}

beforeEach(() => vi.clearAllMocks());

describe("stack summary resource limits", () => {
  it("halves the page and merges the same layers as a clean single-page read", async () => {
    const nodes = [member(43, 1), member(44, 2)];
    mockGraphql
      .mockResolvedValueOnce(stackPage(2, nodes))
      .mockResolvedValueOnce(stackPage(2, nodes));
    const clean = await fetchPollSummary({ stackPrNumber: 44 }, repo);

    mockGraphql.mockReset();
    mockGraphql
      .mockResolvedValueOnce(stackPage(2, nodes))
      .mockRejectedValueOnce(resourceLimit())
      .mockResolvedValueOnce(stackPage(2, [nodes[0]], "page-2"))
      .mockResolvedValueOnce(stackPage(2, [nodes[1]]));
    const shrunk = await fetchPollSummary({ stackPrNumber: 44 }, repo);

    expect(shrunk).toEqual(clean);
    expect(mockGraphql.mock.calls.map((call) => call[1])).toEqual([
      { owner: "acme", repo: "widgets", anchor: 44, after: null },
      { owner: "acme", repo: "widgets", anchor: 44, after: null, first: 2 },
      { owner: "acme", repo: "widgets", anchor: 44, after: null, first: 1 },
      { owner: "acme", repo: "widgets", anchor: 44, after: "page-2", first: 1 },
    ]);
  });

  it("exits TEMPFAIL when a one-entry page still hits the resource limit", async () => {
    const nodes = [member(43, 1), member(44, 2)];
    mockGraphql.mockResolvedValueOnce(stackPage(2, nodes)).mockRejectedValue(resourceLimit());

    await expect(fetchPollSummary({ stackPrNumber: 44 }, repo)).rejects.toMatchObject({
      exitCode: EXIT.TEMPFAIL,
      message: expect.stringMatching(/Resource limits for this query exceeded/),
    });
    expect(mockGraphql.mock.calls.map((call) => call[1])).toEqual([
      { owner: "acme", repo: "widgets", anchor: 44, after: null },
      { owner: "acme", repo: "widgets", anchor: 44, after: null, first: 2 },
      { owner: "acme", repo: "widgets", anchor: 44, after: null, first: 1 },
    ]);
  });

  it("does not shrink the page for a permission error", async () => {
    const nodes = [member(43, 1), member(44, 2)];
    const denied = new GitHubRequestError(
      "GitHub GraphQL error: Resource not accessible by integration",
      {
        status: 200,
        graphqlErrors: [{ message: "Resource not accessible by integration" }],
      },
    );
    mockGraphql.mockResolvedValueOnce(stackPage(2, nodes)).mockRejectedValueOnce(denied);

    await expect(fetchPollSummary({ stackPrNumber: 44 }, repo)).rejects.toMatchObject({
      exitCode: EXIT.NOPERM,
    });
    expect(mockGraphql).toHaveBeenCalledTimes(2);
  });
});
