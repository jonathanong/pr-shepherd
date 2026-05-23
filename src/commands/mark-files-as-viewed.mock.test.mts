/* eslint-disable max-lines */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetRepoInfo, mockGetCurrentPrNumber, mockGraphql, mockGraphqlWithRateLimit } =
  vi.hoisted(() => ({
    mockGetRepoInfo: vi.fn(),
    mockGetCurrentPrNumber: vi.fn(),
    mockGraphql: vi.fn(),
    mockGraphqlWithRateLimit: vi.fn(),
  }));

vi.mock("../github/client.mts", () => ({
  getRepoInfo: mockGetRepoInfo,
  getCurrentPrNumber: mockGetCurrentPrNumber,
  graphql: mockGraphql,
  graphqlWithRateLimit: mockGraphqlWithRateLimit,
}));

import { runMarkFilesAsViewed } from "./mark-files-as-viewed.mts";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetRepoInfo.mockResolvedValue({ owner: "owner", name: "repo" });
  mockGetCurrentPrNumber.mockResolvedValue(42);
  mockGraphql.mockResolvedValue(filesResponse(["src/a.ts"]));
  mockGraphqlWithRateLimit.mockImplementation(async (doc: string) => markResponse(doc));
});

describe("runMarkFilesAsViewed", () => {
  it("marks exact changed paths and reports missing paths", async () => {
    mockGraphql.mockResolvedValueOnce(filesResponse(["src/a.ts", "src/b.ts"]));

    const result = await runMarkFilesAsViewed({
      format: "text",
      files: ["src/a.ts", "src/missing.ts"],
    });

    expect(result.markedPaths).toEqual(["src/a.ts"]);
    expect(result.missingPaths).toEqual(["src/missing.ts"]);
    expect(mockGraphqlWithRateLimit).toHaveBeenCalledTimes(1);
    expect(mockGraphqlWithRateLimit.mock.calls[0]?.[0]).toContain("markFileAsViewed");
  });

  it("selects tests and skips already viewed files", async () => {
    mockGraphql.mockResolvedValueOnce(
      filesResponse([
        { path: "src/a.test.ts", viewerViewedState: "UNVIEWED" },
        { path: "tests/b.rs", viewerViewedState: "VIEWED" },
        { path: "tests.rs", viewerViewedState: "UNVIEWED" },
        { path: "test.rs", viewerViewedState: "UNVIEWED" },
        { path: "src/main.ts", viewerViewedState: "UNVIEWED" },
      ]),
    );

    const result = await runMarkFilesAsViewed({ format: "text", files: [], tests: true });

    expect(result.matchedPaths).toEqual(["src/a.test.ts", "tests/b.rs", "tests.rs", "test.rs"]);
    expect(result.markedPaths).toEqual(["src/a.test.ts", "tests.rs", "test.rs"]);
    expect(result.alreadyViewedPaths).toEqual(["tests/b.rs"]);
  });

  it("does not report selectors unmatched when they match already-selected files", async () => {
    mockGraphql.mockResolvedValueOnce(filesResponse(["tests/a.test.ts"]));

    const result = await runMarkFilesAsViewed({
      format: "text",
      files: ["tests/a.test.ts"],
      tests: true,
      matchPatterns: ["a\\.test"],
    });

    expect(result.matchedPaths).toEqual(["tests/a.test.ts"]);
    expect(result.unmatchedSelectors).toEqual([]);
    expect(result.markedPaths).toEqual(["tests/a.test.ts"]);
  });

  it("reports unmatched selectors when tests and match patterns select nothing new", async () => {
    mockGraphql.mockResolvedValueOnce(filesResponse(["src/main.ts"]));

    const result = await runMarkFilesAsViewed({
      format: "text",
      files: [],
      tests: true,
      matchPatterns: ["docs"],
    });

    expect(result.matchedPaths).toEqual([]);
    expect(result.unmatchedSelectors).toEqual(["--tests", "--match docs"]);
    expect(mockGraphqlWithRateLimit).not.toHaveBeenCalled();
  });

  it("supports repeated --match patterns", async () => {
    mockGraphql.mockResolvedValueOnce(filesResponse(["docs/a.md", "src/foo.ts", "src/bar.ts"]));

    const result = await runMarkFilesAsViewed({
      format: "text",
      files: [],
      matchPatterns: ["^docs/", "bar"],
    });

    expect(result.matchedPaths).toEqual(["docs/a.md", "src/bar.ts"]);
    expect(result.markedPaths).toEqual(["docs/a.md", "src/bar.ts"]);
  });

  it("paginates changed files", async () => {
    mockGraphql
      .mockResolvedValueOnce(
        filesResponse(["src/a.ts"], { hasNextPage: true, endCursor: "cursor-1" }),
      )
      .mockResolvedValueOnce(filesResponse(["src/b.ts"]));

    const result = await runMarkFilesAsViewed({
      format: "text",
      files: ["src/a.ts", "src/b.ts"],
    });

    expect(result.markedPaths).toEqual(["src/a.ts", "src/b.ts"]);
    expect(mockGraphql).toHaveBeenCalledTimes(2);
    expect(mockGraphql.mock.calls[1]?.[1]).toMatchObject({ filesCursor: "cursor-1" });
  });

  it("batches mutations in chunks of 10", async () => {
    const paths = Array.from({ length: 12 }, (_, i) => `src/${i}.ts`);
    mockGraphql.mockResolvedValueOnce(filesResponse(paths));

    const result = await runMarkFilesAsViewed({ format: "text", files: paths });

    expect(result.markedPaths).toEqual(paths);
    expect(mockGraphqlWithRateLimit).toHaveBeenCalledTimes(2);
  });

  it("reports rate-limited pending paths", async () => {
    const paths = Array.from({ length: 12 }, (_, i) => `src/${i}.ts`);
    mockGraphql.mockResolvedValueOnce(filesResponse(paths));
    mockGraphqlWithRateLimit.mockResolvedValueOnce({
      ...markResponse("  m0:\n  m1:\n  m2:\n  m3:\n  m4:\n  m5:\n  m6:\n  m7:\n  m8:\n  m9:"),
      rateLimit: { remaining: 0, limit: 5000, resetAt: 1700000000 },
    });

    const result = await runMarkFilesAsViewed({ format: "text", files: paths });

    expect(result.markedPaths).toEqual(paths.slice(0, 10));
    expect(result.unmarkedPaths).toEqual(paths.slice(10));
    expect(result.rateLimit?.message).toContain("remaining is 0");
    expect(mockGraphqlWithRateLimit).toHaveBeenCalledTimes(1);
  });

  it("reports thrown non-rate-limit mutation errors per path", async () => {
    mockGraphql.mockResolvedValueOnce(filesResponse(["src/a.ts", "src/b.ts"]));
    mockGraphqlWithRateLimit.mockRejectedValueOnce(new Error("server unavailable"));

    const result = await runMarkFilesAsViewed({
      format: "text",
      files: ["src/a.ts", "src/b.ts"],
    });

    expect(result.markedPaths).toEqual([]);
    expect(result.errors).toEqual(["src/a.ts: server unavailable", "src/b.ts: server unavailable"]);
  });

  it("stops on thrown rate limits and reports all pending paths", async () => {
    mockGraphql.mockResolvedValueOnce(filesResponse(["src/a.ts", "src/b.ts"]));
    mockGraphqlWithRateLimit.mockRejectedValueOnce(
      Object.assign(new Error("API rate limit exceeded"), {
        status: 403,
        retryAfterSeconds: 60,
      }),
    );

    const result = await runMarkFilesAsViewed({
      format: "text",
      files: ["src/a.ts", "src/b.ts"],
    });

    expect(result.rateLimit).toMatchObject({
      message: "API rate limit exceeded",
      retryAfterSeconds: 60,
    });
    expect(result.unmarkedPaths).toEqual(["src/a.ts", "src/b.ts"]);
    expect(result.errors).toEqual(["rate limit: API rate limit exceeded"]);
  });

  it("records alias failures from GraphQL errors", async () => {
    mockGraphql.mockResolvedValueOnce(filesResponse(["src/a.ts", "src/b.ts"]));
    mockGraphqlWithRateLimit.mockResolvedValueOnce({
      data: {
        m0: { pullRequest: { id: "PR_1" } },
        m1: null,
      },
      errors: [
        { message: "path is not in this pull request", path: ["m1", "markFileAsViewed"] },
        { message: "unmapped warning" },
      ],
    });

    const result = await runMarkFilesAsViewed({
      format: "text",
      files: ["src/a.ts", "src/b.ts"],
    });

    expect(result.markedPaths).toEqual(["src/a.ts"]);
    expect(result.errors).toEqual(["src/b.ts: path is not in this pull request"]);
  });

  it("suppresses current-chunk null errors when GraphQL reports a rate-limit error", async () => {
    mockGraphql.mockResolvedValueOnce(filesResponse(["src/a.ts", "src/b.ts"]));
    mockGraphqlWithRateLimit.mockResolvedValueOnce({
      data: {
        m0: { pullRequest: { id: "PR_1" } },
        m1: null,
      },
      errors: [{ message: "You have exceeded a secondary rate limit" }],
      rateLimit: { remaining: 10, limit: 5000, resetAt: 1700000000 },
    });

    const result = await runMarkFilesAsViewed({
      format: "text",
      files: ["src/a.ts", "src/b.ts"],
    });

    expect(result.markedPaths).toEqual(["src/a.ts"]);
    expect(result.errors).toEqual(["rate limit: You have exceeded a secondary rate limit"]);
    expect(result.unmarkedPaths).toEqual(["src/b.ts"]);
  });

  it("errors when no PR number can be resolved", async () => {
    mockGetCurrentPrNumber.mockResolvedValueOnce(null);

    await expect(runMarkFilesAsViewed({ format: "text", files: ["src/a.ts"] })).rejects.toThrow(
      "No PR number provided",
    );
  });

  it("errors when the PR is not found", async () => {
    mockGraphql.mockResolvedValueOnce({ data: { repository: { pullRequest: null } } });

    await expect(runMarkFilesAsViewed({ format: "text", files: ["src/a.ts"] })).rejects.toThrow(
      "PR #42 not found",
    );
  });

  it("errors when the PR disappears while paginating files", async () => {
    mockGraphql
      .mockResolvedValueOnce(
        filesResponse(["src/a.ts"], { hasNextPage: true, endCursor: "cursor-1" }),
      )
      .mockResolvedValueOnce({ data: { repository: { pullRequest: null } } });

    await expect(runMarkFilesAsViewed({ format: "text", files: ["src/a.ts"] })).rejects.toThrow(
      "PR #42 not found",
    );
  });

  it("rejects invalid match regexes", async () => {
    await expect(
      runMarkFilesAsViewed({ format: "text", files: [], matchPatterns: ["["] }),
    ).rejects.toThrow(/Invalid --match regex/);
  });
});

function filesResponse(
  files: Array<string | { path: string; viewerViewedState?: string | null }>,
  pageInfo: { hasNextPage?: boolean; endCursor?: string | null } = {},
) {
  return {
    data: {
      repository: {
        pullRequest: {
          id: "PR_1",
          number: 42,
          files: {
            pageInfo: { hasNextPage: false, endCursor: null, ...pageInfo },
            nodes: files.map((file) =>
              typeof file === "string"
                ? { path: file, viewerViewedState: "UNVIEWED" }
                : { viewerViewedState: "UNVIEWED", ...file },
            ),
          },
        },
      },
    },
  };
}

function markResponse(doc: string) {
  const data: Record<string, unknown> = {};
  for (const line of doc.split("\n")) {
    const alias = line.trim().split(":", 1)[0] ?? "";
    if (!isMarkAlias(alias)) continue;
    data[alias] = { pullRequest: { id: "PR_1" } };
  }
  return { data };
}

function isMarkAlias(value: string): boolean {
  if (!value.startsWith("m")) return false;
  if (value.length === 1) return false;
  for (const char of value.slice(1)) {
    if (char < "0" || char > "9") return false;
  }
  return true;
}
