import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client.mts", () => ({ graphqlWithRateLimit: vi.fn() }));

import { graphqlWithRateLimit } from "./client.mts";
import { hydrateReadyAnnotationProbe } from "./poll-summary-annotation-probe.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

const mockGraphql = vi.mocked(graphqlWithRateLimit);
const repo = { owner: "acme", name: "widgets" };
const review = { actionable: 0 };

function readyPr(overrides: Partial<RawSummaryPr> = {}): RawSummaryPr {
  return {
    number: 7,
    title: "Ready",
    url: "https://github.com/acme/widgets/pull/7",
    state: "OPEN",
    isDraft: false,
    viewerCanUpdate: true,
    headRefName: "feature",
    headRefOid: "a".repeat(40),
    baseRefOid: "b".repeat(40),
    baseRefName: "main",
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: null,
    isInMergeQueue: false,
    commits: {
      nodes: [
        {
          commit: {
            oid: "c".repeat(40),
            statusCheckRollup: {
              contexts: {
                totalCount: 1,
                pageInfo: { hasPreviousPage: false },
                nodes: [
                  {
                    __typename: "CheckRun",
                    id: "CR1",
                    name: "ci",
                    status: "COMPLETED",
                    conclusion: "SUCCESS",
                    checkSuite: null,
                  },
                ],
              },
            },
          },
        },
      ],
    },
    comments: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    reviews: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    reviewThreads: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    ...overrides,
  } as RawSummaryPr;
}

beforeEach(() => vi.clearAllMocks());

describe("hydrateReadyAnnotationProbe", () => {
  it("skips a layer that is not otherwise ready", async () => {
    await hydrateReadyAnnotationProbe(readyPr({ isDraft: true }), repo, review);
    expect(mockGraphql).not.toHaveBeenCalled();
  });

  it("skips a ready layer whose check runs have no id", async () => {
    const pr = readyPr();
    const node = pr.commits.nodes[0]?.commit.statusCheckRollup?.contexts.nodes[0];
    if (node?.__typename === "CheckRun") node.id = undefined;
    await hydrateReadyAnnotationProbe(pr, repo, review);
    expect(mockGraphql).not.toHaveBeenCalled();
  });

  it("merges annotation totals onto the matching check run", async () => {
    const pr = readyPr();
    mockGraphql.mockResolvedValue({
      data: {
        repository: {
          object: {
            __typename: "Commit",
            oid: "c".repeat(40),
            statusCheckRollup: {
              contexts: {
                nodes: [{ __typename: "CheckRun", id: "CR1", annotations: { totalCount: 2 } }],
              },
            },
          },
        },
      },
    });
    await hydrateReadyAnnotationProbe(pr, repo, review);
    expect(pr.commits.nodes[0]?.commit.statusCheckRollup?.contexts.nodes[0]).toMatchObject({
      annotations: { totalCount: 2 },
    });
  });

  it("ignores a probe for a different commit and a failed request", async () => {
    const pr = readyPr();
    mockGraphql.mockResolvedValueOnce({
      data: { repository: { object: { __typename: "Commit", oid: "d".repeat(40) } } },
    });
    await hydrateReadyAnnotationProbe(pr, repo, review);
    expect(pr.commits.nodes[0]?.commit.statusCheckRollup?.contexts.nodes[0]).not.toHaveProperty(
      "annotations",
    );

    mockGraphql.mockRejectedValueOnce(new Error("rate limit"));
    await expect(hydrateReadyAnnotationProbe(pr, repo, review)).resolves.toBeUndefined();
  });
});
