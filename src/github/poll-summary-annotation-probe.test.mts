import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client.mts", () => ({ graphqlWithRateLimit: vi.fn() }));

import { graphqlWithRateLimit } from "./client.mts";
import {
  annotationProbeUnavailable,
  hydrateReadyAnnotationProbe,
  readyFingerprint,
} from "./poll-summary-annotation-probe.mts";
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
                pageInfo: { hasPreviousPage: false, startCursor: null },
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
    expect(annotationProbeUnavailable(pr)).toBe(false);
    expect(readyFingerprint(pr, "stored")).not.toBe("stored");
    expect(mockGraphql.mock.calls[0]?.[1]).toMatchObject({ before: null });
  });

  it("pages older check runs before merging annotation totals", async () => {
    const pr = readyPr();
    const contexts = pr.commits.nodes[0]?.commit.statusCheckRollup?.contexts;
    if (!contexts) throw new Error("missing contexts");
    contexts.nodes.push({
      __typename: "CheckRun",
      id: "CR2",
      name: "lint",
      status: "COMPLETED",
      conclusion: "SUCCESS",
      checkSuite: null,
    });
    const page = (hasPreviousPage: boolean, cursor: string | null, id: string, total: number) => ({
      data: {
        repository: {
          object: {
            __typename: "Commit",
            oid: "c".repeat(40),
            statusCheckRollup: {
              contexts: {
                pageInfo: { hasPreviousPage, startCursor: cursor },
                nodes: [{ __typename: "CheckRun", id, annotations: { totalCount: total } }],
              },
            },
          },
        },
      },
    });
    mockGraphql
      .mockResolvedValueOnce(page(true, "older", "CR1", 1))
      .mockResolvedValueOnce(page(false, null, "CR2", 4));
    await hydrateReadyAnnotationProbe(pr, repo, review);
    expect(contexts.nodes.map((node) => ("annotations" in node ? node.annotations : null))).toEqual(
      [{ totalCount: 1 }, { totalCount: 4 }],
    );
    expect(mockGraphql.mock.calls[1]?.[1]).toMatchObject({ before: "older" });
    expect(annotationProbeUnavailable(pr)).toBe(false);
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

    expect(annotationProbeUnavailable(pr)).toBe(true);

    mockGraphql.mockRejectedValueOnce(new Error("rate limit"));
    await expect(hydrateReadyAnnotationProbe(pr, repo, review)).resolves.toBeUndefined();
    expect(annotationProbeUnavailable(pr)).toBe(true);
    expect(pr.commits.nodes[0]?.commit.statusCheckRollup?.contexts.nodes[0]).not.toHaveProperty(
      "annotations",
    );
  });

  it("does not merge a partial page when the next cursor is missing", async () => {
    const pr = readyPr();
    mockGraphql.mockResolvedValue({
      data: {
        repository: {
          object: {
            __typename: "Commit",
            oid: "c".repeat(40),
            statusCheckRollup: {
              contexts: {
                pageInfo: { hasPreviousPage: true, startCursor: null },
                nodes: [{ __typename: "CheckRun", id: "CR1", annotations: { totalCount: 3 } }],
              },
            },
          },
        },
      },
    });
    await hydrateReadyAnnotationProbe(pr, repo, review);
    expect(annotationProbeUnavailable(pr)).toBe(true);
    expect(pr.commits.nodes[0]?.commit.statusCheckRollup?.contexts.nodes[0]).not.toHaveProperty(
      "annotations",
    );
    expect(readyFingerprint(pr, "stored")).toBe("stored");
  });
});
