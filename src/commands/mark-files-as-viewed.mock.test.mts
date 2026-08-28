import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetRepoInfo, mockGetCurrentPrNumber, mockGraphql } = vi.hoisted(() => ({
  mockGetRepoInfo: vi.fn(),
  mockGetCurrentPrNumber: vi.fn(),
  mockGraphql: vi.fn(),
}));

vi.mock("../github/client.mts", () => ({
  getRepoInfo: mockGetRepoInfo,
  getCurrentPrNumber: mockGetCurrentPrNumber,
  graphql: mockGraphql,
}));

import { runMarkFilesAsViewed } from "./mark-files-as-viewed.mts";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetRepoInfo.mockResolvedValue({ owner: "owner", name: "repo" });
  mockGetCurrentPrNumber.mockResolvedValue(42);
  mockGraphql.mockResolvedValue(filesResponse(["src/a.ts"]));
});

describe("runMarkFilesAsViewed", () => {
  it("selects files but performs no mutation when authorization cannot be verified", async () => {
    mockGraphql.mockResolvedValueOnce(filesResponse(["src/a.ts", "src/b.ts"]));

    const result = await runMarkFilesAsViewed({
      format: "text",
      files: ["src/a.ts", "src/missing.ts"],
    });

    expect(result.matchedPaths).toEqual(["src/a.ts"]);
    expect(result.markedPaths).toEqual([]);
    expect(result.missingPaths).toEqual(["src/missing.ts"]);
    expect(result.authorizationSkipped).toBe("unverifiable");
    expect(mockGraphql).toHaveBeenCalledTimes(1);
  });

  it("does not report an authorization skip when every selected file was already viewed", async () => {
    mockGraphql.mockResolvedValueOnce(
      filesResponse([{ path: "tests/a.test.ts", viewerViewedState: "VIEWED" }]),
    );

    const result = await runMarkFilesAsViewed({ format: "text", files: [], tests: true });

    expect(result.alreadyViewedPaths).toEqual(["tests/a.test.ts"]);
    expect(result.authorizationSkipped).toBeUndefined();
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

function filesResponse(files: Array<string | { path: string; viewerViewedState?: string | null }>) {
  return {
    data: {
      repository: {
        pullRequest: {
          id: "PR_1",
          number: 42,
          files: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: files.map((file) =>
              typeof file === "string" ? { path: file, viewerViewedState: "UNVIEWED" } : file,
            ),
          },
        },
      },
    },
  };
}
