import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client.mts", () => ({ graphqlWithRateLimit: vi.fn(), getMergeableState: vi.fn() }));
vi.mock("../state/seen-comments.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../state/seen-comments.mts")>();
  return { ...actual, loadSeenMap: vi.fn().mockResolvedValue(new Map()) };
});

import { getMergeableState, graphqlWithRateLimit } from "./client.mts";
import { fetchPollSummary } from "./poll-summary.mts";
import { refreshUnknownSummaryMergeability } from "./poll-summary-mergeability.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

const mockGraphql = vi.mocked(graphqlWithRateLimit);
const mockRest = vi.mocked(getMergeableState);
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
    mergeable: "UNKNOWN",
    mergeStateStatus: "UNKNOWN",
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

function stackPage(nodes: unknown[]) {
  return {
    data: {
      repository: {
        viewerCanAdminister: false,
        pullRequest: {
          stack: {
            id: "STACK",
            number: 7,
            size: nodes.length,
            baseRefName: "main",
            entries: { pageInfo: { hasNextPage: false, endCursor: null }, nodes },
          },
        },
      },
    },
  };
}

beforeEach(() => vi.clearAllMocks());

describe("refreshUnknownSummaryMergeability", () => {
  it("routes a stack layer as a conflict when REST resolves GraphQL's UNKNOWN", async () => {
    const page = stackPage([{ position: 1, pullRequest: rawPr(43) }]);
    mockGraphql.mockResolvedValueOnce(page).mockResolvedValueOnce(page);
    mockRest.mockResolvedValue({
      mergeable: "CONFLICTING",
      mergeStateStatus: "DIRTY",
      state: "OPEN",
    });

    const result = await fetchPollSummary({ stackPrNumber: 43, merge: true }, repo);

    expect(mockRest).toHaveBeenCalledWith(43, "acme", "widgets");
    expect(result.prs[0]).toMatchObject({
      pr: 43,
      action: "fix_code",
      reasons: ["merge-conflicts"],
      mergeable: "CONFLICTING",
      mergeStateStatus: "DIRTY",
    });
  });

  it("refreshes explicit PRs and adopts a REST merged state", async () => {
    mockGraphql.mockResolvedValue({
      data: { repository: { viewerCanAdminister: false, pr0: rawPr(42), pr1: rawPr(43) } },
    });
    mockRest
      .mockResolvedValueOnce({ mergeable: "UNKNOWN", mergeStateStatus: "UNKNOWN", state: "MERGED" })
      .mockResolvedValueOnce({ mergeable: "MERGEABLE", mergeStateStatus: "CLEAN" });

    const result = await fetchPollSummary({ prNumbers: [42, 43] }, repo);

    expect(result.prs[0]).toMatchObject({ pr: 42, action: "cancel", reasons: ["merged"] });
    expect(result.prs[1]).toMatchObject({ mergeable: "MERGEABLE", mergeStateStatus: "CLEAN" });
  });

  it("skips REST for closed PRs and known mergeability", async () => {
    const closed = rawPr(1, { state: "CLOSED" }) as unknown as RawSummaryPr;
    const known = rawPr(2, {
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
    }) as unknown as RawSummaryPr;

    await refreshUnknownSummaryMergeability(closed, repo);
    await refreshUnknownSummaryMergeability(known, repo);

    expect(mockRest).not.toHaveBeenCalled();
  });

  it("refreshes when only mergeStateStatus is UNKNOWN", async () => {
    const pr = rawPr(3, { mergeable: "MERGEABLE" }) as unknown as RawSummaryPr;
    mockRest.mockResolvedValue({ mergeable: "MERGEABLE", mergeStateStatus: "BEHIND" });

    await refreshUnknownSummaryMergeability(pr, repo);

    expect(pr).toMatchObject({ state: "OPEN", mergeStateStatus: "BEHIND" });
  });

  it("keeps a known GraphQL field when REST is still computing", async () => {
    const pr = rawPr(4, { mergeable: "CONFLICTING" }) as unknown as RawSummaryPr;
    mockRest.mockResolvedValue({ mergeable: "UNKNOWN", mergeStateStatus: "UNKNOWN" });

    await refreshUnknownSummaryMergeability(pr, repo);

    expect(pr).toMatchObject({ mergeable: "CONFLICTING", mergeStateStatus: "UNKNOWN" });
  });
});
