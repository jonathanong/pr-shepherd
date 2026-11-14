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

function stackOf(numbers: number[]) {
  const entries = numbers.map((number, index) => ({
    position: index + 1,
    pullRequest: pr(number),
  }));
  return {
    data: {
      repository: {
        viewerCanAdminister: false,
        pullRequest: {
          stack: {
            id: "STACK",
            number: 7,
            size: numbers.length,
            baseRefName: "main",
            entries: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: entries },
          },
        },
      },
    },
  };
}

const minimizedIds = () => vi.mocked(autoMinimizeComments).mock.calls.flat(2).sort();

describe("stack auto-resolve stays inside the owned, in-scope layers", () => {
  it("skips layers the caller did not list", async () => {
    mockGraphql.mockResolvedValueOnce(stackOf([43, 44, 45]));
    await fetchPollSummary({ stackPrNumber: 44, stackOwned: [43, 44] }, repo);
    expect(minimizedIds()).toEqual(["IC_43", "IC_44"]);
  });

  it("skips layers above a --merge-through target", async () => {
    mockGraphql.mockResolvedValueOnce(stackOf([43, 44, 45]));
    await fetchPollSummary({ stackPrNumber: 44, stackMerge: { kind: "through", pr: 44 } }, repo);
    expect(minimizedIds()).toEqual(["IC_43", "IC_44"]);
  });
});
