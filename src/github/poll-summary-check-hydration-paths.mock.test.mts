import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client.mts", () => ({ graphqlWithRateLimit: vi.fn() }));
vi.mock("./poll-summary-projector.mts", () => ({
  summarizePollSummaryPr: vi.fn(async (raw: { number: number }) => ({ pr: raw.number })),
}));

import { graphqlWithRateLimit } from "./client.mts";
import { fetchPollSummary, fetchRawSummaryPr } from "./poll-summary.mts";
import { summarizePollSummaryChecks } from "./poll-summary-checks.mts";
import { fingerprintRawSummaryPr } from "./poll-summary-fingerprint.mts";
import { summarizePollSummaryPr } from "./poll-summary-projector.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

const mockGraphql = vi.mocked(graphqlWithRateLimit);
const mockSummarize = vi.mocked(summarizePollSummaryPr);
const repo = { owner: "acme", name: "widgets" };
const HEAD = "a".repeat(40);
const TOTAL = 150;

const checkRun = (index: number) => ({
  __typename: "CheckRun",
  name: `check-${index}`,
  status: "COMPLETED",
  conclusion: "SUCCESS",
  checkSuite: null,
});
const range = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, offset) => checkRun(from + offset));

// Each summary query returns the newest 100 contexts. The two queries return
// different opaque cursors so the fingerprint must not depend on them.
function rawPr(startCursor: string) {
  return {
    number: 42,
    state: "OPEN",
    updatedAt: "2026-01-01T00:00:00Z",
    isDraft: false,
    headRefName: "feature",
    headRefOid: HEAD,
    baseRefName: "main",
    baseRefOid: "c".repeat(40),
    mergeQueueEntry: null,
    comments: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    reviews: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    reviewThreads: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    stack: { number: 7, size: 1, baseRefName: "main" },
    stackEntry: { position: 1 },
    commits: {
      nodes: [
        {
          commit: {
            oid: HEAD,
            statusCheckRollup: {
              contexts: {
                totalCount: TOTAL,
                pageInfo: { hasPreviousPage: true, startCursor },
                nodes: range(50, TOTAL),
              },
            },
          },
        },
      ],
    },
  };
}

function respond(query: string, variables: Record<string, unknown> = {}) {
  if (query.includes("query PollSummaryCheckPage")) {
    expect(variables).toMatchObject({ oid: HEAD });
    const contexts = {
      totalCount: TOTAL,
      pageInfo: { hasPreviousPage: false, startCursor: "oldest" },
      nodes: range(0, 50),
    };
    return {
      data: {
        repository: {
          object: { __typename: "Commit", oid: HEAD, statusCheckRollup: { contexts } },
        },
      },
    };
  }
  // The topology read precedes the summary read; both see the same one-entry stack.
  if (query.includes("query PollStackTopology") || query.includes("query PollStackSummary")) {
    const entries = {
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [{ position: 1, pullRequest: rawPr("stack-cursor") }],
    };
    const stack = { id: "STACK", number: 7, size: 1, baseRefName: "main", entries };
    return { data: { repository: { viewerCanAdminister: false, pullRequest: { stack } } } };
  }
  return { data: { repository: { viewerCanAdminister: false, pr0: rawPr("explicit-cursor") } } };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGraphql.mockImplementation(async (query, variables) => respond(query, variables) as never);
});

describe("poll summary check hydration across fetch paths", () => {
  it("gives a PR with more than 100 contexts the same complete evidence on both paths", async () => {
    const explicit = await fetchRawSummaryPr(42, repo);
    await fetchPollSummary({ stackPrNumber: 42 }, repo);
    const stacked = mockSummarize.mock.calls[0]![0] as RawSummaryPr;

    for (const raw of [explicit, stacked]) {
      expect(summarizePollSummaryChecks(raw)).toEqual({ passing: TOTAL });
    }
    expect(fingerprintRawSummaryPr(stacked)).toBe(fingerprintRawSummaryPr(explicit));
  });
});
