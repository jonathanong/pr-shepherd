import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/load.mts", async (importOriginal) => {
  const { testConfig } = await import("../../test-helpers/config/test-config.mts");
  const config = testConfig({
    iterate: { "ready-delay-minutes": 10 },
    "mark-ready": { "blocking-reviewer-logins": ["copilot"] },
  });
  return {
    ...(await importOriginal<typeof import("../config/load.mts")>()),
    loadConfig: () => config,
  };
});
vi.mock("./client.mts", () => ({ graphqlWithRateLimit: vi.fn() }));
vi.mock("./rest-explicit-summary-read.mts", () => ({ readRestExplicitSummary: vi.fn() }));
vi.mock("../state/seen-comments.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../state/seen-comments.mts")>();
  return { ...actual, loadSeenMap: vi.fn().mockResolvedValue(new Map()) };
});

import { graphqlWithRateLimit } from "./client.mts";
import { fetchPollSummary } from "./poll-summary.mts";
import { readRestExplicitSummary } from "./rest-explicit-summary-read.mts";
import { runWithGithubTransport } from "./transport.mts";

const mockGraphql = vi.mocked(graphqlWithRateLimit);
const mockRest = vi.mocked(readRestExplicitSummary);
const repo = { owner: "acme", name: "widgets" };

function rawPr(number: number) {
  return {
    number,
    title: `PR ${number}`,
    url: `https://github.com/acme/widgets/pull/${number}`,
    state: number % 7 === 0 ? "MERGED" : "OPEN",
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
  };
}

/** Echo one aliased `pullRequest` per `$prN` variable, like GitHub does. */
async function answerAliases(_query: string, variables?: object) {
  const repository: Record<string, unknown> = { viewerCanAdminister: true };
  for (const [key, value] of Object.entries(variables ?? {})) {
    if (/^pr\d+$/.test(key)) repository[key] = rawPr(value as number);
  }
  return { data: { repository } } as never;
}

function aliasCount(variables: unknown): number {
  return Object.keys(variables as object).filter((key) => /^pr\d+$/.test(key)).length;
}

/** Descending, non-contiguous numbers prove rows follow the request, not sorted PR order. */
const requested = Array.from({ length: 120 }, (_, index) => 1000 - index * 3);

beforeEach(() => vi.clearAllMocks());

describe("large explicit PR selections", () => {
  it("chunks 120 PRs over GraphQL into 50, 50 and 20 aliases in request order", async () => {
    mockGraphql.mockImplementation(answerAliases);

    const result = await fetchPollSummary({ prNumbers: requested }, repo);

    expect(result.selection).toEqual({ kind: "prs", requested });
    expect(result.prs.map(({ pr }) => pr)).toEqual(requested);
    expect(result.prs.filter(({ action }) => action === "cancel")).toHaveLength(
      requested.filter((pr) => pr % 7 === 0).length,
    );
    expect(mockGraphql).toHaveBeenCalledTimes(3);
    expect(mockGraphql.mock.calls.map(([, variables]) => aliasCount(variables))).toEqual([
      50, 50, 20,
    ]);
    expect(mockGraphql.mock.calls[1]![1]).toMatchObject({
      pr0: requested[50],
      pr49: requested[99],
    });
    expect(mockGraphql.mock.calls[2]![1]).toMatchObject({
      pr0: requested[100],
      pr19: requested[119],
    });
  });

  it("issues no empty trailing query for exactly 100 PRs", async () => {
    mockGraphql.mockImplementation(answerAliases);
    const result = await fetchPollSummary({ prNumbers: requested.slice(0, 100) }, repo);
    expect(result.prs).toHaveLength(100);
    expect(mockGraphql).toHaveBeenCalledTimes(2);
  });

  it("chunks 120 PRs over REST into 50, 50 and 20 reads in request order", async () => {
    mockRest.mockImplementation(async (prs) => prs.map((pr) => rawPr(pr)) as never);

    const result = await runWithGithubTransport("rest", () =>
      fetchPollSummary({ prNumbers: requested }, repo),
    );

    expect(result.prs.map(({ pr }) => pr)).toEqual(requested);
    expect(mockRest.mock.calls.map(([prs]) => prs)).toEqual([
      requested.slice(0, 50),
      requested.slice(50, 100),
      requested.slice(100),
    ]);
    expect(mockGraphql).not.toHaveBeenCalled();
  });
});
