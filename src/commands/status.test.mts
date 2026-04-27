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

type RawPrOverrides = Partial<{
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
}>;

function makeRawPr(overrides: RawPrOverrides = {}) {
  return {
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
    ...overrides,
  };
}

/** Wraps a single PR in the batched alias format used by runStatus. */
function makeBatchResponse(prNumber: number, overrides: RawPrOverrides = {}) {
  return {
    data: {
      repository: {
        [`pr_${prNumber}`]: makeRawPr({ number: prNumber, ...overrides }),
      },
    },
  };
}

/** Wraps a single PR in the pullRequest format used by the paged follow-up query. */
function makePagedResponse(overrides: RawPrOverrides = {}) {
  return {
    data: {
      repository: {
        pullRequest: makeRawPr(overrides),
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
    [
      "HAS_HOOKS (branch protection — same verdict as BLOCKED)",
      { mergeStateStatus: "HAS_HOOKS", ciState: null },
      "BLOCKED",
    ],
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
  it("truncates title with ellipsis at 50 chars total", () => {
    const longTitle = "A".repeat(60);
    const out = formatStatusTable([makeSummary({ title: longTitle })], "owner/repo");
    expect(out).toContain("A".repeat(47) + "...");
    expect(out).not.toContain("A".repeat(48));
  });

  it("appends threadsTruncated note when flag is true", () => {
    const out = formatStatusTable([makeSummary({ threadsTruncated: true })], "owner/repo");
    expect(out).toContain("threads truncated");
  });

  it("does not append truncation note when false", () => {
    const out = formatStatusTable([makeSummary({ threadsTruncated: false })], "owner/repo");
    expect(out).not.toContain("threads truncated");
  });

  it("renders a Markdown table header and separator", () => {
    const out = formatStatusTable([makeSummary()], "owner/repo");
    expect(out).toContain("| PR | Title | Verdict | CI |");
    expect(out).toContain("| --- | --- | --- | --- |");
  });

  it("escapes pipe characters in titles", () => {
    const out = formatStatusTable([makeSummary({ title: "feat: a|b" })], "owner/repo");
    expect(out).toContain("a\\|b");
    expect(out).not.toContain("a|b");
  });

  it("returns only heading for empty summaries", () => {
    const out = formatStatusTable([], "owner/repo");
    expect(out).toBe("# owner/repo — PR status (0)");
    expect(out).not.toContain("| --- |");
  });
});

// ---------------------------------------------------------------------------
// runStatus
// ---------------------------------------------------------------------------

describe("runStatus — empty input", () => {
  it("returns empty array when prNumbers is empty", async () => {
    const result = await runStatus({ prNumbers: [], format: "text" });
    expect(result).toEqual([]);
    expect(mockGraphql).not.toHaveBeenCalled();
  });
});

describe("runStatus — multi-PR batch", () => {
  it("fetches multiple PRs in a single request", async () => {
    mockGraphql.mockResolvedValueOnce({
      data: {
        repository: {
          pr_10: makeRawPr({ number: 10, title: "PR ten", state: "OPEN" }),
          pr_20: makeRawPr({ number: 20, title: "PR twenty", state: "MERGED" }),
        },
      },
    });

    const summaries = await runStatus({ prNumbers: [10, 20], format: "text" });
    expect(mockGraphql).toHaveBeenCalledTimes(1);
    expect(summaries).toHaveLength(2);
    expect(summaries[0]!.number).toBe(10);
    expect(summaries[1]!.number).toBe(20);
    expect(summaries[1]!.state).toBe("MERGED");
  });
});

describe("runStatus — PR not found", () => {
  it("throws when PR alias is null", async () => {
    mockGraphql.mockResolvedValue({ data: { repository: { pr_99: null } } });
    await expect(runStatus({ prNumbers: [99], format: "text" })).rejects.toThrow(
      "PR #99 not found",
    );
  });
});

describe("runStatus — pagination", () => {
  it("fetches additional pages when totalCount > nodes.length", async () => {
    // First call: batched query, 1 node but totalCount=2
    mockGraphql
      .mockResolvedValueOnce(
        makeBatchResponse(42, {
          reviewThreads: {
            totalCount: 2,
            pageInfo: { hasPreviousPage: true, startCursor: "cursor-abc" },
            nodes: [{ isResolved: false }],
          },
        }),
      )
      // Second call (per-PR pagination using MULTI_PR_STATUS_QUERY_WITH_CURSOR)
      .mockResolvedValueOnce(
        makePagedResponse({
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
    });
    expect(summary!.unresolvedThreads).toBe(2);
    expect(mockGraphql).toHaveBeenCalledTimes(2);
  });

  it("sets threadsTruncated when totalCount still exceeds collected nodes", async () => {
    // First page: 1 node, totalCount=5, no more pages
    mockGraphql.mockResolvedValueOnce(
      makeBatchResponse(42, {
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
    });
    expect(summary!.threadsTruncated).toBe(true);
  });
});
