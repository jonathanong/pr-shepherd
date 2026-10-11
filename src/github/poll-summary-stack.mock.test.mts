import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client.mts", () => ({ graphqlWithRateLimit: vi.fn() }));
// Each read here starts cold; the anchor's stack-size hint has its own tests.
vi.mock("./stack-size-hint.mts", () => ({
  loadStackSizeHint: vi.fn(async () => 0),
  storeStackSizeHint: vi.fn(async () => {}),
}));
vi.mock("../state/seen-comments.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../state/seen-comments.mts")>();
  return { ...actual, loadSeenMap: vi.fn().mockResolvedValue(new Map()) };
});

import { graphqlWithRateLimit } from "./client.mts";
import { fetchPollSummary } from "./poll-summary.mts";
import { POLL_STACK_SUMMARY_QUERY } from "./queries.mts";
import { loadStackSizeHint } from "./stack-size-hint.mts";

const mockGraphql = vi.mocked(graphqlWithRateLimit);
const repo = { owner: "acme", name: "widgets" };

const sha = (number: number) => String(number).padStart(40, "0");

/** Stack member at `position` whose base is the previous member's current head. */
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

function stackPage(
  size: number,
  nodes: unknown[],
  endCursor: string | null = null,
  viewerLogin?: string,
) {
  return {
    data: {
      ...(viewerLogin ? { viewer: { login: viewerLogin } } : {}),
      repository: {
        viewerCanAdminister: false,
        pullRequest: {
          stack: {
            id: "STACK",
            number: 7,
            size,
            baseRefName: "main",
            entries: { pageInfo: { hasNextPage: endCursor !== null, endCursor }, nodes },
          },
        },
      },
    },
  };
}

beforeEach(() => vi.clearAllMocks());

describe("fetchPollSummary native stack reads", () => {
  it("reads an unsized stack in one four-entry summary page, without a topology read", async () => {
    const reversed = [member(44, 2), member(43, 1)];
    mockGraphql.mockResolvedValueOnce(stackPage(2, reversed));

    const result = await fetchPollSummary({ stackPrNumber: 44 }, repo);

    const base = { owner: "acme", repo: "widgets", anchor: 44, after: null };
    expect(mockGraphql.mock.calls).toEqual([[POLL_STACK_SUMMARY_QUERY, { ...base, first: 4 }]]);
    expect(result.selection).toEqual({ kind: "stack", anchor: 44, stackNumber: 7, stackSize: 2 });
    expect(result.prs.map((item) => item.pr)).toEqual([43, 44]);
    expect(result.stackAncestry).toBeUndefined();
  });

  it("marks a layer owned only when its author matches the viewer", async () => {
    const owned = stackPage(1, [member(43, 1)], null, "Alice");
    const ownedPr = owned.data.repository.pullRequest.stack.entries.nodes[0] as {
      pullRequest: { author?: { login: string } };
    };
    ownedPr.pullRequest.author = { login: "alice" };
    mockGraphql.mockResolvedValue(owned);
    const match = await fetchPollSummary({ stackPrNumber: 43 }, repo);
    expect(match.prs[0]).toMatchObject({ authorLogin: "alice", owned: true });

    const other = stackPage(1, [member(43, 1)], null, "bob");
    const otherPr = other.data.repository.pullRequest.stack.entries.nodes[0] as {
      pullRequest: { author?: { login: string } };
    };
    otherPr.pullRequest.author = { login: "alice" };
    mockGraphql.mockResolvedValue(other);
    const mismatch = await fetchPollSummary({ stackPrNumber: 43 }, repo);
    expect(mismatch.prs[0]?.authorLogin).toBe("alice");
    expect(mismatch.prs[0]?.owned).toBeUndefined();
  });

  it("caps the hydrated page at 50 entries and asks a later page only for the entries that remain", async () => {
    const members = Array.from({ length: 51 }, (_, index) => member(101 + index, index + 1));
    const [first50, last] = [members.slice(0, 50), members.slice(50)];
    vi.mocked(loadStackSizeHint).mockResolvedValueOnce(51);
    mockGraphql
      .mockResolvedValueOnce(stackPage(51, first50, "summary-2"))
      .mockResolvedValueOnce(stackPage(51, last));

    const result = await fetchPollSummary({ stackPrNumber: 101 }, repo);

    const variables = mockGraphql.mock.calls.map((call) => call[1]);
    expect(variables).toEqual([
      expect.objectContaining({ first: 50, after: null }),
      expect.objectContaining({ first: 1, after: "summary-2" }),
    ]);
    expect(result.prs.map((item) => item.pr)).toEqual(members.map((m) => m.pullRequest.number));
  });

  it("pages an unsized stack past four entries for only the entries that remain", async () => {
    const members = Array.from({ length: 6 }, (_, index) => member(101 + index, index + 1));
    mockGraphql
      .mockResolvedValueOnce(stackPage(6, members.slice(0, 4), "summary-2"))
      .mockResolvedValueOnce(stackPage(6, members.slice(4)));

    const result = await fetchPollSummary({ stackPrNumber: 101 }, repo);

    expect(mockGraphql.mock.calls.map((call) => call[1])).toEqual([
      expect.objectContaining({ first: 4, after: null }),
      expect.objectContaining({ first: 2, after: "summary-2" }),
    ]);
    expect(result.prs.map((item) => item.pr)).toEqual(members.map((m) => m.pullRequest.number));
  });
});
