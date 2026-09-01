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
  mockGraphqlWithRateLimit.mockImplementation((document: string) =>
    Promise.resolve({ data: successfulMutationData(document) }),
  );
});

describe("runMarkFilesAsViewed", () => {
  it("marks selected unviewed files without a viewer-capability preflight", async () => {
    mockGraphql.mockResolvedValueOnce(filesResponse(["src/a.ts", "src/b.ts"]));

    const result = await runMarkFilesAsViewed({
      format: "text",
      files: ["src/a.ts", "src/missing.ts"],
    });

    expect(result.matchedPaths).toEqual(["src/a.ts"]);
    expect(result.markedPaths).toEqual(["src/a.ts"]);
    expect(result.missingPaths).toEqual(["src/missing.ts"]);
    expect(result.authorizationSkipped).toBeUndefined();
    expect(mockGraphql).toHaveBeenCalledTimes(1);
    expect(mockGraphqlWithRateLimit).toHaveBeenCalledWith(
      expect.stringContaining(
        'markFileAsViewed(input: { pullRequestId: "PR_1", path: "src/a.ts" })',
      ),
      {},
      { allowPartialData: true },
    );
  });

  it("does not report an authorization skip when every selected file was already viewed", async () => {
    mockGraphql.mockResolvedValueOnce(
      filesResponse([{ path: "tests/a.test.ts", viewerViewedState: "VIEWED" }]),
    );

    const result = await runMarkFilesAsViewed({ format: "text", files: [], tests: true });

    expect(result.alreadyViewedPaths).toEqual(["tests/a.test.ts"]);
    expect(result.authorizationSkipped).toBeUndefined();
    expect(mockGraphqlWithRateLimit).not.toHaveBeenCalled();
  });

  it("paginates changed files and applies match selectors", async () => {
    mockGraphql
      .mockResolvedValueOnce(
        filesResponse(["src/a.ts"], { hasNextPage: true, endCursor: "cursor-1" }),
      )
      .mockResolvedValueOnce(filesResponse(["docs/guide.md"]));

    const result = await runMarkFilesAsViewed({
      format: "text",
      files: [],
      matchPatterns: ["^docs/", "^missing/"],
    });

    expect(result.matchedPaths).toEqual(["docs/guide.md"]);
    expect(result.markedPaths).toEqual(["docs/guide.md"]);
    expect(result.unmatchedSelectors).toEqual(["--match ^missing/"]);
    expect(mockGraphql).toHaveBeenCalledTimes(2);
  });

  it("batches mutations in order", async () => {
    const paths = Array.from({ length: 11 }, (_, index) => `src/${index}.ts`);
    mockGraphql.mockResolvedValueOnce(filesResponse(paths));

    const result = await runMarkFilesAsViewed({ format: "text", files: paths });

    expect(result.markedPaths).toEqual(paths);
    expect(mockGraphqlWithRateLimit).toHaveBeenCalledTimes(2);
    expect(mockGraphqlWithRateLimit.mock.calls[0]?.[0]).toContain("f9: markFileAsViewed");
    expect(mockGraphqlWithRateLimit.mock.calls[1]?.[0]).toContain("f0: markFileAsViewed");
    expect(mockGraphqlWithRateLimit.mock.calls[1]?.[0]).toContain('path: "src/10.ts"');
  });

  it("preserves exact alias-scoped errors while retaining successful paths", async () => {
    mockGraphql.mockResolvedValueOnce(filesResponse(["src/a.ts", "src/b.ts"]));
    mockGraphqlWithRateLimit.mockResolvedValueOnce({
      data: { f0: { clientMutationId: null }, f1: null },
      errors: [{ message: "Resource not accessible by integration", path: ["f1"] }],
    });

    const result = await runMarkFilesAsViewed({
      format: "text",
      files: ["src/a.ts", "src/b.ts"],
    });

    expect(result.markedPaths).toEqual(["src/a.ts"]);
    expect(result.errors).toEqual(["src/b.ts: Resource not accessible by integration"]);
    expect(result.unmarkedPaths).toBeUndefined();
  });

  it("stops on a rate limit and returns an ordered pending path list", async () => {
    const paths = Array.from({ length: 11 }, (_, index) => `src/${index}.ts`);
    mockGraphql.mockResolvedValueOnce(filesResponse(paths));
    mockGraphqlWithRateLimit.mockResolvedValueOnce({
      data: { f0: { clientMutationId: null }, f1: null },
      errors: [{ message: "API rate limit exceeded", path: ["f1"] }],
      rateLimit: { remaining: 0, limit: 5000, resetAt: 1700000000 },
      retryAfterSeconds: 60,
    });

    const result = await runMarkFilesAsViewed({ format: "text", files: paths });

    expect(result.markedPaths).toEqual(["src/0.ts"]);
    expect(result.errors).toEqual(["rate limit: API rate limit exceeded"]);
    expect(result.rateLimit).toMatchObject({ remaining: 0, retryAfterSeconds: 60 });
    expect(result.unmarkedPaths).toEqual(paths.slice(1));
    expect(mockGraphqlWithRateLimit).toHaveBeenCalledTimes(1);
  });

  it("preserves unscoped mutation errors when the rate-limit snapshot reaches zero", async () => {
    const paths = Array.from({ length: 11 }, (_, index) => `src/${index}.ts`);
    mockGraphql.mockResolvedValueOnce(filesResponse(paths));
    mockGraphqlWithRateLimit.mockResolvedValueOnce({
      data: { f0: null, f1: null },
      errors: [{ message: "Resource not accessible by integration" }],
      rateLimit: { remaining: 0, limit: 5000, resetAt: 1700000000 },
    });

    const result = await runMarkFilesAsViewed({ format: "text", files: paths });

    expect(result.errors).toEqual([
      ...paths.slice(0, 10).map((path) => `${path}: Resource not accessible by integration`),
      "rate limit: GitHub GraphQL rate limit remaining is 0",
    ]);
    expect(result.unmarkedPaths).toEqual(paths.slice(10));
    expect(mockGraphqlWithRateLimit).toHaveBeenCalledTimes(1);
  });

  it("reports a missing PR discovered during file pagination", async () => {
    mockGraphql
      .mockResolvedValueOnce(
        filesResponse(["src/a.ts"], { hasNextPage: true, endCursor: "cursor-1" }),
      )
      .mockResolvedValueOnce({ data: { repository: { pullRequest: null } } });

    await expect(runMarkFilesAsViewed({ format: "text", files: ["src/a.ts"] })).rejects.toThrow(
      "PR #42 not found",
    );
  });

  it("errors when no PR number can be resolved", async () => {
    mockGetCurrentPrNumber.mockResolvedValueOnce(null);
    await expect(runMarkFilesAsViewed({ format: "text", files: ["src/a.ts"] })).rejects.toThrow(
      "No PR number provided",
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
  pageInfo = { hasNextPage: false, endCursor: null as string | null },
) {
  return {
    data: {
      repository: {
        pullRequest: {
          id: "PR_1",
          number: 42,
          files: {
            pageInfo,
            nodes: files.map((file) =>
              typeof file === "string" ? { path: file, viewerViewedState: "UNVIEWED" } : file,
            ),
          },
        },
      },
    },
  };
}

function successfulMutationData(document: string): Record<string, { clientMutationId: null }> {
  return Object.fromEntries(
    [...document.matchAll(/\bf(\d+): markFileAsViewed/g)].map((match) => [
      `f${match[1]}`,
      { clientMutationId: null },
    ]),
  );
}
