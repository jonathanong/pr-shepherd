import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GLOBAL_OPTS,
  makeBatch,
  makeThread,
  mockFetchBatch,
  mockGetCurrentBranch,
  mockReadFile,
  registerHooks,
  setupHappyPath,
} from "../../test-helpers/commands/commit-suggestion.test-support.mts";
import { EXIT } from "../exit-codes.mts";
import { runCommitSuggestion } from "./commit-suggestion.mts";

registerHooks();

describe("runCommitSuggestion — suggestion range validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentBranch.mockResolvedValue("feature/foo");
    setupHappyPath();
  });

  it("rejects the adjacent object-row reproduction from filaments#10073", async () => {
    const fileLines = Array.from({ length: 100 }, (_, index) => `line ${index + 1}`);
    fileLines[48] =
      "  { loading: PodcastsLoading, name: 'podcasts', showFooter: false, skeleton: PodcastListSkeleton },";
    fileLines[49] =
      "  { aside: AsideSkeleton, loading: PostsLoading, name: 'posts', skeleton: PostListSkeleton },";
    const originalContent = `${fileLines.join("\n")}\n`;
    const body = [
      "```suggestion",
      fileLines[48],
      "  { aside: AsideSkeleton, loading: PostsLoading, name: 'posts', showFooter: undefined, skeleton: PostListSkeleton },",
      "```",
    ].join("\n");
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([makeThread({ line: 49, startLine: 49, body })]),
    });
    mockReadFile.mockResolvedValue(originalContent as never);

    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" }),
    ).rejects.toMatchObject({
      exitCode: EXIT.UNAVAILABLE,
      message: expect.stringContaining("src/foo.ts:49"),
    });
  });

  it("rejects the declaration and leading-entry reproduction from filaments#10073", async () => {
    const fileLines = Array.from({ length: 100 }, (_, index) => `line ${index + 1}`);
    fileLines.splice(
      87,
      6,
      "const skeletons: Array<{",
      "  component: ComponentType",
      "  count: number",
      "  name: string",
      "}> = [",
      "  { component: AsideSkeleton, count: 4, name: 'aside' },",
    );
    const originalContent = `${fileLines.join("\n")}\n`;
    const body = [
      "```suggestion",
      "const skeletons: Array<{",
      "  component: ComponentType",
      "  count: number // derived from Skeleton primitives: see component source",
      "  name: string",
      "}> = [",
      "```",
    ].join("\n");
    mockFetchBatch.mockResolvedValue({
      data: makeBatch([makeThread({ line: 93, startLine: 93, body })]),
    });
    mockReadFile.mockResolvedValue(originalContent as never);

    await expect(
      runCommitSuggestion({ ...GLOBAL_OPTS, threadId: "PRRT_x", message: "fix" }),
    ).rejects.toMatchObject({
      exitCode: EXIT.UNAVAILABLE,
      message: expect.stringContaining("partially rewrites a source block before"),
    });
  });
});
