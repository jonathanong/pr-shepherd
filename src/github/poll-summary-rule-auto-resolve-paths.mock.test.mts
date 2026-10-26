import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClassifyItem } from "../classify/types.mts";

vi.mock("../config/load.mts", async (importOriginal) => {
  const { testConfig } = await import("../../test-helpers/config/test-config.mts");
  const config = testConfig({});
  return {
    ...(await importOriginal<typeof import("../config/load.mts")>()),
    loadConfig: () => config,
  };
});
vi.mock("./client.mts", () => ({ graphqlWithRateLimit: vi.fn() }));
vi.mock("./stack-size-hint.mts", () => ({
  loadStackSizeHint: vi.fn(async () => 0),
  storeStackSizeHint: vi.fn(async () => {}),
}));
vi.mock("../classify/loader.mts", () => ({
  loadClassifyRules: vi.fn().mockResolvedValue([
    {
      name: "bot-notice",
      file: "bot-notice.mjs",
      rule: (item: ClassifyItem) =>
        item.body.includes("notice")
          ? { suppress: true, autoResolve: true, reason: "bot notice" }
          : null,
    },
  ]),
}));
vi.mock("../comments/resolve.mts", () => ({
  autoMinimizeComments: vi.fn(async (ids: string[]) => ({ minimized: ids, errors: [] })),
  autoResolveThreads: vi.fn(async (ids: string[]) => ({ resolved: ids, errors: [] })),
}));
vi.mock("../state/seen-comments.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../state/seen-comments.mts")>();
  return {
    ...actual,
    loadSeenMap: vi.fn().mockResolvedValue(new Map()),
    markSeen: vi.fn().mockResolvedValue(undefined),
  };
});

import { autoMinimizeComments } from "../comments/resolve.mts";
import { graphqlWithRateLimit } from "./client.mts";
import { fetchPollSummary } from "./poll-summary.mts";
import { summarizePollSummaryPr } from "./poll-summary-projector.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

const mockGraphql = vi.mocked(graphqlWithRateLimit);
const repo = { owner: "acme", name: "widgets" };
const sha = (number: number) => String(number).padStart(40, "0");

function pr(number: number, position?: number) {
  return {
    number,
    title: `PR ${number}`,
    url: `https://github.com/acme/widgets/pull/${number}`,
    state: "OPEN",
    isDraft: false,
    viewerCanUpdate: true,
    headRefName: `feature-${number}`,
    headRefOid: sha(number),
    baseRefName: "main",
    baseRefOid: sha(1),
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: null,
    isInMergeQueue: false,
    stack: null,
    stackEntry: null,
    comments: {
      totalCount: 1,
      pageInfo: { hasPreviousPage: false },
      nodes: [
        {
          id: `IC_${number}`,
          body: "Review in progress notice",
          isMinimized: false,
          viewerCanMinimize: true,
          url: `https://github.com/acme/widgets/pull/${number}#issuecomment-1`,
          author: { login: "coderabbitai[bot]", __typename: "Bot" },
        },
      ],
    },
    reviews: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    reviewThreads: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    commits: { nodes: [{ commit: { statusCheckRollup: null } }] },
    ...(position === undefined ? {} : { position }),
  };
}

beforeEach(() => vi.clearAllMocks());

describe("aggregate summaries perform rule-driven auto-resolve", () => {
  it("minimizes a matching notice for each PR of an explicit set and does not route it", async () => {
    mockGraphql.mockResolvedValue({
      data: { repository: { viewerCanAdminister: false, pr0: pr(42), pr1: pr(43) } },
    });
    const result = await fetchPollSummary({ prNumbers: [42, 43] }, repo);
    expect(vi.mocked(autoMinimizeComments).mock.calls).toEqual([[["IC_42"]], [["IC_43"]]]);
    for (const item of result.prs) {
      expect(item.review).toEqual({ comments: 1 });
      expect(item.ruleAutoResolve).toMatchObject({
        summary: "minimized 1 comment (rule: bot notice)",
        minimized: [{ id: `IC_${item.pr}`, kind: "pr-comment", ruleReason: "bot notice" }],
      });
    }
  });

  it("does the same for every layer of a native stack", async () => {
    const entries = [43, 44].map((number, index) => ({
      position: index + 1,
      pullRequest: pr(number),
    }));
    mockGraphql.mockResolvedValueOnce({
      data: {
        repository: {
          viewerCanAdminister: false,
          pullRequest: {
            stack: {
              id: "STACK",
              number: 7,
              size: 2,
              baseRefName: "main",
              entries: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: entries },
            },
          },
        },
      },
    });
    const result = await fetchPollSummary({ stackPrNumber: 44 }, repo);
    expect(vi.mocked(autoMinimizeComments).mock.calls.flat(2).sort()).toEqual(["IC_43", "IC_44"]);
    expect(result.prs.map((item) => item.ruleAutoResolve?.summary)).toEqual([
      "minimized 1 comment (rule: bot notice)",
      "minimized 1 comment (rule: bot notice)",
    ]);
    expect(result.prs.every((item) => item.review?.actionable === undefined)).toBe(true);
  });
});

describe("read-only summary callers", () => {
  it("never mutate GitHub while validating a receipt or merge readiness", async () => {
    const item = await summarizePollSummaryPr(pr(42) as unknown as RawSummaryPr, repo, {
      stackPrNumber: 42,
    });
    expect(autoMinimizeComments).not.toHaveBeenCalled();
    expect(item.ruleAutoResolve).toBeUndefined();
    expect(item.review).toMatchObject({ comments: 1, actionable: 1 });
  });
});
