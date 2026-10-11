import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client.mts", () => ({ graphqlWithRateLimit: vi.fn() }));
vi.mock("../state/seen-comments.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../state/seen-comments.mts")>();
  return { ...actual, loadSeenMap: vi.fn().mockResolvedValue(new Map()) };
});

import { graphqlWithRateLimit } from "./client.mts";
import { fetchPollSummary } from "./poll-summary.mts";
import { POLL_STACK_SUMMARY_QUERY, POLL_STACK_TOPOLOGY_QUERY } from "./queries.mts";
import { loadStackSizeHint } from "./stack-size-hint.mts";
import { storeDerived } from "../state/rest-cache.mts";

const mockGraphql = vi.mocked(graphqlWithRateLimit);
const repo = { owner: "acme", name: "widgets" };
const stateKey = { owner: "acme", repo: "widgets", pr: 44 };
const sha = (number: number) => String(number).padStart(40, "0");
let directory: string;

function member(number: number, position: number) {
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
      baseRefName: position === 1 ? "main" : `feature-${number - 1}`,
      baseRefOid: position === 1 ? sha(1) : sha(number - 1),
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

function stackPage(size: number, nodes: unknown[], endCursor: string | null = null) {
  return {
    data: {
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

const base = { owner: "acme", repo: "widgets", anchor: 44, after: null };
const two = [member(43, 1), member(44, 2)];

beforeEach(async () => {
  vi.clearAllMocks();
  directory = await mkdtemp(join(tmpdir(), "shepherd-stack-size-"));
  vi.stubEnv("PR_SHEPHERD_STATE_DIR", directory);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

describe("stack summary size hint", () => {
  it("reads the topology only for the anchor's first summary", async () => {
    mockGraphql.mockResolvedValue(stackPage(2, two));

    await fetchPollSummary({ stackPrNumber: 44 }, repo);
    expect(await loadStackSizeHint(stateKey)).toBe(2);
    await fetchPollSummary({ stackPrNumber: 44 }, repo);

    expect(mockGraphql.mock.calls).toEqual([
      [POLL_STACK_TOPOLOGY_QUERY, base],
      [POLL_STACK_SUMMARY_QUERY, { ...base, first: 2 }],
      [POLL_STACK_SUMMARY_QUERY, { ...base, first: 2 }],
    ]);
  });

  it("pages on when the stack has grown past the hint, then sizes the next read to it", async () => {
    await storeDerived(stateKey, "stack-size", 2);
    const three = [...two, member(45, 3)];
    mockGraphql
      .mockResolvedValueOnce(stackPage(3, two, "summary-2"))
      .mockResolvedValueOnce(stackPage(3, three.slice(2)))
      .mockResolvedValueOnce(stackPage(3, three));

    const grown = await fetchPollSummary({ stackPrNumber: 44 }, repo);
    expect(grown.prs.map((item) => item.pr)).toEqual([43, 44, 45]);
    await fetchPollSummary({ stackPrNumber: 44 }, repo);

    expect(mockGraphql.mock.calls).toEqual([
      [POLL_STACK_SUMMARY_QUERY, { ...base, first: 2 }],
      [POLL_STACK_SUMMARY_QUERY, { ...base, after: "summary-2", first: 1 }],
      [POLL_STACK_SUMMARY_QUERY, { ...base, first: 3 }],
    ]);
  });

  it("ignores a hint that is not a positive integer", async () => {
    await storeDerived(stateKey, "stack-size", "2");
    expect(await loadStackSizeHint(stateKey)).toBe(0);
    await storeDerived(stateKey, "stack-size", 0);
    expect(await loadStackSizeHint(stateKey)).toBe(0);
  });
});
