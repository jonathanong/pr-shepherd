import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../github/client.mts", () => ({
  graphql: vi.fn(),
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "owner", name: "repo" }),
}));

import { runStatus, formatStatusTable, type PrSummary } from "./status.mts";
import { graphql } from "../github/client.mts";

const mockGraphql = vi.mocked(graphql);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSummary(overrides: Partial<PrSummary> = {}): PrSummary {
  return {
    number: 1,
    title: "My PR",
    state: "OPEN",
    isDraft: false,
    mergeStateStatus: "CLEAN",
    reviewDecision: "APPROVED",
    unresolvedThreads: 0,
    ciState: "SUCCESS",
    threadsTruncated: false,
    ...overrides,
  };
}

function makeRawResponse(
  pr: Partial<{
    number: number;
    title: string;
    state: string;
    isDraft: boolean;
    mergeStateStatus: string;
    reviewDecision: string | null;
    reviewThreads: {
      totalCount: number;
      pageInfo?: { hasPreviousPage: boolean; startCursor: string | null };
      nodes: Array<{ isResolved: boolean }>;
    };
    commits: { nodes: Array<{ commit: { statusCheckRollup: { state: string } | null } }> };
  }> = {},
) {
  return {
    data: {
      repository: {
        pullRequest: {
          number: 42,
          title: "Fix bug",
          state: "OPEN",
          isDraft: false,
          mergeStateStatus: "CLEAN",
          reviewDecision: "APPROVED",
          reviewThreads: {
            totalCount: 0,
            pageInfo: { hasPreviousPage: false, startCursor: null },
            nodes: [],
          },
          commits: { nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS" } } }] },
          ...pr,
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// deriveVerdict (tested indirectly via formatStatusTable)
// ---------------------------------------------------------------------------

describe("formatStatusTable — deriveVerdict precedence", () => {
  const cases: Array<[string, Partial<PrSummary>, string]> = [
    ["MERGED state", { state: "MERGED" }, "MERGED"],
    ["CLOSED state", { state: "CLOSED" }, "CLOSED"],
    ["DRAFT", { isDraft: true }, "DRAFT"],
    [
      "READY (CLEAN + SUCCESS + 0 threads + APPROVED)",
      {
        mergeStateStatus: "CLEAN",
        ciState: "SUCCESS",
        unresolvedThreads: 0,
        reviewDecision: "APPROVED",
      },
      "READY",
    ],
    ["BLOCKED merge state", { mergeStateStatus: "BLOCKED", ciState: null }, "BLOCKED"],
    ["DIRTY (CONFLICTS)", { mergeStateStatus: "DIRTY", ciState: null }, "CONFLICTS"],
    ["PENDING ciState", { mergeStateStatus: "UNKNOWN", ciState: "PENDING" }, "IN PROGRESS"],
    ["EXPECTED ciState", { mergeStateStatus: "UNKNOWN", ciState: "EXPECTED" }, "IN PROGRESS"],
    ["FAILURE ciState", { mergeStateStatus: "UNKNOWN", ciState: "FAILURE" }, "FAILING"],
    ["ERROR ciState", { mergeStateStatus: "UNKNOWN", ciState: "ERROR" }, "FAILING"],
    ["fallback to mergeStateStatus", { mergeStateStatus: "UNSTABLE", ciState: null }, "UNSTABLE"],
  ];

  it.each(cases)("%s → %s", (_label, overrides, expected) => {
    const summary = makeSummary(overrides);
    const out = formatStatusTable([summary], "owner/repo");
    expect(out).toContain(expected);
  });

  it("READY requires !CHANGES_REQUESTED", () => {
    const summary = makeSummary({
      mergeStateStatus: "CLEAN",
      ciState: "SUCCESS",
      unresolvedThreads: 0,
      reviewDecision: "CHANGES_REQUESTED",
    });
    const out = formatStatusTable([summary], "owner/repo");
    expect(out).not.toContain("READY");
  });
});

// ---------------------------------------------------------------------------
// formatStatusTable — formatting
// ---------------------------------------------------------------------------

describe("formatStatusTable — formatting", () => {
  it("truncates title to 50 chars", () => {
    const longTitle = "A".repeat(60);
    const out = formatStatusTable([makeSummary({ title: longTitle })], "owner/repo");
    expect(out).toContain("A".repeat(50));
    expect(out).not.toContain("A".repeat(51));
  });

  it("appends threadsTruncated note when flag is true", () => {
    const out = formatStatusTable([makeSummary({ threadsTruncated: true })], "owner/repo");
    expect(out).toContain("threads truncated");
  });

  it("does not append truncation note when false", () => {
    const out = formatStatusTable([makeSummary({ threadsTruncated: false })], "owner/repo");
    expect(out).not.toContain("threads truncated");
  });
});

// ---------------------------------------------------------------------------
// runStatus
// ---------------------------------------------------------------------------

describe("runStatus — PR not found", () => {
  it("throws when pullRequest is null", async () => {
    mockGraphql.mockResolvedValue({ data: { repository: { pullRequest: null } } });
    await expect(
      runStatus({ prNumbers: [99], format: "text", noCache: false, cacheTtlSeconds: 300 }),
    ).rejects.toThrow("PR #99 not found");
  });
});

describe("runStatus — pagination", () => {
  it("fetches additional pages when totalCount > nodes.length", async () => {
    // First call: 1 node but totalCount=2
    mockGraphql
      .mockResolvedValueOnce(
        makeRawResponse({
          reviewThreads: {
            totalCount: 2,
            pageInfo: { hasPreviousPage: true, startCursor: "cursor-abc" },
            nodes: [{ isResolved: false }],
          },
        }),
      )
      // Second call (pagination): 1 more unresolved node
      .mockResolvedValueOnce(
        makeRawResponse({
          reviewThreads: {
            totalCount: 2,
            pageInfo: { hasPreviousPage: false, startCursor: null },
            nodes: [{ isResolved: false }],
          },
        }),
      );

    const [summary] = await runStatus({
      prNumbers: [42],
      format: "text",
      noCache: false,
      cacheTtlSeconds: 300,
    });
    expect(summary!.unresolvedThreads).toBe(2);
    expect(mockGraphql).toHaveBeenCalledTimes(2);
  });

  it("sets threadsTruncated when totalCount still exceeds collected nodes", async () => {
    // First page: 1 node, totalCount=5, no more pages
    mockGraphql.mockResolvedValueOnce(
      makeRawResponse({
        reviewThreads: {
          totalCount: 5,
          pageInfo: { hasPreviousPage: false, startCursor: null },
          nodes: [{ isResolved: false }],
        },
      }),
    );

    const [summary] = await runStatus({
      prNumbers: [42],
      format: "text",
      noCache: false,
      cacheTtlSeconds: 300,
    });
    expect(summary!.threadsTruncated).toBe(true);
  });
});
