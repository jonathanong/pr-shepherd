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
    baseRefOid: "main-sha",
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
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("poll summary stack ancestry", () => {
  it("returns raw mismatches for adjacent open entries and skips closed entries", async () => {
    mockGraphql.mockResolvedValue({
      data: {
        repository: {
          pullRequest: {
            stack: {
              id: "STACK",
              number: 7,
              size: 4,
              baseRefName: "main",
              entries: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [
                  { position: 1, pullRequest: rawPr(43) },
                  {
                    position: 2,
                    pullRequest: rawPr(44, {
                      baseRefName: "feature-43",
                      baseRefOid: "wrong-parent-sha",
                    }),
                  },
                  { position: 3, pullRequest: rawPr(45, { state: "CLOSED" }) },
                  {
                    position: 4,
                    pullRequest: rawPr(46, {
                      baseRefName: "feature-45",
                      baseRefOid: "wrong-closed-parent-sha",
                    }),
                  },
                ],
              },
            },
          },
        },
      },
    });

    const result = await fetchPollSummary({ stackPrNumber: 44 }, repo);

    expect(result.stackAncestry).toEqual([
      {
        parentPr: 43,
        parentHeadRefName: "feature-43",
        parentHeadRefOid: String(43).padStart(40, "0"),
        childPr: 44,
        childBaseRefName: "feature-43",
        childBaseRefOid: "wrong-parent-sha",
      },
    ]);
  });
});
