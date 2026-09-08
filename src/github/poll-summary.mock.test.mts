import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client.mts", () => ({ graphqlWithRateLimit: vi.fn() }));
vi.mock("../state/seen-comments.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../state/seen-comments.mts")>();
  return { ...actual, loadSeenMap: vi.fn().mockResolvedValue(new Map()) };
});

import { graphqlWithRateLimit } from "./client.mts";
import { fetchPollSummary } from "./poll-summary.mts";

const mockGraphql = vi.mocked(graphqlWithRateLimit);
const repo = { owner: "acme", name: "widgets" };

function rawPr(number: number, overrides: Record<string, unknown> = {}) {
  return {
    number,
    title: `PR ${number}`,
    url: `https://github.com/acme/widgets/pull/${number}`,
    state: "OPEN",
    isDraft: false,
    viewerCanUpdate: true,
    headRefName: `feature-${number}`,
    headRefOid: String(number).padStart(40, "0"),
    baseRefName: "main",
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: null,
    isInMergeQueue: false,
    stack: null,
    stackEntry: null,
    comments: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    reviews: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    reviewThreads: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    commits: {
      nodes: [
        {
          commit: {
            statusCheckRollup: {
              state: "SUCCESS",
              contexts: {
                totalCount: 1,
                pageInfo: { hasPreviousPage: false },
                nodes: [{ __typename: "CheckRun", status: "COMPLETED", conclusion: "SUCCESS" }],
              },
            },
          },
        },
      ],
    },
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("fetchPollSummary", () => {
  it("fetches explicit PRs in one aliased query and returns routing hints", async () => {
    mockGraphql.mockResolvedValue({
      data: {
        repository: {
          viewerPermission: "WRITE",
          pr0: rawPr(42, { state: "MERGED" }),
          pr1: rawPr(43, {
            commits: {
              nodes: [
                {
                  commit: {
                    statusCheckRollup: {
                      state: "FAILURE",
                      contexts: {
                        totalCount: 1,
                        pageInfo: { hasPreviousPage: false },
                        nodes: [
                          {
                            __typename: "CheckRun",
                            status: "COMPLETED",
                            conclusion: "FAILURE",
                          },
                        ],
                      },
                    },
                  },
                },
              ],
            },
          }),
        },
      },
    });

    const result = await fetchPollSummary({ prNumbers: [42, 43, 42] }, repo);

    expect(result.selection).toEqual({ kind: "prs", requested: [42, 43] });
    expect(result.prs.map(({ pr, action }) => ({ pr, action }))).toEqual([
      { pr: 42, action: "cancel" },
      { pr: 43, action: "fix_code" },
    ]);
    expect(result.prs[0]).toMatchObject({
      mergeable: "MERGEABLE",
    });
    expect(result.prs[0]).not.toHaveProperty("review");
    expect(mockGraphql).toHaveBeenCalledTimes(1);
    expect(mockGraphql.mock.calls[0]![0]).toContain("pr1: pullRequest(number: $pr1)");
  });

  it("chunks explicit selections at 50 PRs", async () => {
    const requested = Array.from({ length: 51 }, (_, index) => index + 1);
    mockGraphql
      .mockResolvedValueOnce({
        data: {
          repository: Object.fromEntries(
            requested.slice(0, 50).map((pr, index) => [`pr${index}`, rawPr(pr)]),
          ),
        },
      })
      .mockResolvedValueOnce({ data: { repository: { pr0: rawPr(51) } } });

    const result = await fetchPollSummary({ prNumbers: requested }, repo);

    expect(result.prs).toHaveLength(51);
    expect(mockGraphql).toHaveBeenCalledTimes(2);
    expect(mockGraphql.mock.calls[0]![0]).toContain("$pr49: Int!");
    expect(mockGraphql.mock.calls[1]![0]).not.toContain("$pr1: Int!");
  });

  it("paginates a native stack and sorts every member bottom-to-top", async () => {
    const stack = { id: "STACK", number: 7, size: 2, baseRefName: "main" };
    mockGraphql
      .mockResolvedValueOnce({
        data: {
          repository: {
            pullRequest: {
              stack: {
                ...stack,
                entries: {
                  pageInfo: { hasNextPage: true, endCursor: "next" },
                  nodes: [{ position: 2, pullRequest: rawPr(44) }],
                },
              },
            },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          repository: {
            pullRequest: {
              stack: {
                ...stack,
                entries: {
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: [{ position: 1, pullRequest: rawPr(43) }],
                },
              },
            },
          },
        },
      });

    const result = await fetchPollSummary({ stackPrNumber: 44 }, repo);

    expect(result.selection).toEqual({
      kind: "stack",
      anchor: 44,
      stackNumber: 7,
      stackSize: 2,
    });
    expect(result.prs.map((item) => item.pr)).toEqual([43, 44]);
    expect(mockGraphql.mock.calls[1]![1]).toMatchObject({ after: "next" });
  });

  it("surfaces incomplete bounded slices without making overflow permanently actionable", async () => {
    mockGraphql.mockResolvedValue({
      data: {
        repository: {
          viewerPermission: "WRITE",
          pr0: rawPr(42, {
            comments: { totalCount: 101, pageInfo: { hasPreviousPage: true }, nodes: [] },
          }),
        },
      },
    });
    const result = await fetchPollSummary({ prNumbers: [42] }, repo);
    expect(result.prs[0]).toMatchObject({
      action: "wait",
      reasons: ["ready-delay"],
      review: { incomplete: true },
    });
  });
});
