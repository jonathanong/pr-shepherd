import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client.mts", () => ({ graphqlWithRateLimit: vi.fn() }));

import { EXIT, ShepherdError } from "../exit-codes.mts";
import { graphqlWithRateLimit } from "./client.mts";
import { fetchRawSummaryPr } from "./poll-summary.mts";

const mockGraphql = vi.mocked(graphqlWithRateLimit);
const repo = { owner: "acme", name: "widgets" };

function rawPr(number: number) {
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
    commits: { nodes: [] },
  };
}

beforeEach(() => vi.clearAllMocks());

describe("fetchRawSummaryPr", () => {
  it("returns the requested raw PR snapshot", async () => {
    const expected = rawPr(42);
    mockGraphql.mockResolvedValue({
      data: { repository: { viewerCanAdminister: false, pr0: expected } },
    });

    await expect(fetchRawSummaryPr(42, repo)).resolves.toEqual(expected);
    expect(mockGraphql).toHaveBeenCalledTimes(1);
    expect(mockGraphql.mock.calls[0]![1]).toMatchObject({
      owner: "acme",
      repo: "widgets",
      pr0: 42,
    });
  });

  it("rejects when GitHub omits the requested PR", async () => {
    mockGraphql.mockResolvedValue({
      data: { repository: { viewerCanAdminister: false, pr0: null } },
    });

    const result = fetchRawSummaryPr(42, repo);
    await expect(result).rejects.toMatchObject({
      message: "PR #42 not found",
      exitCode: EXIT.UNAVAILABLE,
    });
    await expect(result).rejects.toBeInstanceOf(ShepherdError);
  });

  it("rejects when the repository is unavailable", async () => {
    mockGraphql.mockResolvedValue({ data: { repository: null } });

    await expect(fetchRawSummaryPr(42, repo)).rejects.toThrow(
      "GitHub GraphQL response did not include repository acme/widgets",
    );
  });
});
