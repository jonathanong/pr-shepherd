import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "owner", name: "repo" }),
  getCurrentPrNumber: vi.fn().mockResolvedValue(42),
}));

vi.mock("../github/batch.mts", () => ({
  fetchPrBatch: vi.fn(),
}));

vi.mock("../comments/resolve.mts", () => ({
  autoResolveOutdated: vi.fn(),
  applyResolveOptions: vi.fn(),
}));

vi.mock("../config/load.mts", () => ({
  loadConfig: vi.fn().mockReturnValue({
    resolve: {
      concurrency: 4,
      shaPoll: { intervalMs: 2000, maxAttempts: 10 },
      fetchReviewSummaries: true,
    },
    actions: {
      autoResolveOutdated: true,
      autoMarkReady: true,
      commitSuggestions: true,
    },
  }),
}));

import { runResolveFetch, runResolveMutate } from "./resolve.mts";
import { getCurrentPrNumber } from "../github/client.mts";
import { fetchPrBatch } from "../github/batch.mts";
import { autoResolveOutdated, applyResolveOptions } from "../comments/resolve.mts";
import { loadConfig } from "../config/load.mts";
import type { BatchPrData, ReviewThread, PrComment } from "../types.mts";

const mockGetCurrentPrNumber = vi.mocked(getCurrentPrNumber);
const mockFetchPrBatch = vi.mocked(fetchPrBatch);
const mockAutoResolveOutdated = vi.mocked(autoResolveOutdated);
const mockApplyResolveOptions = vi.mocked(applyResolveOptions);
const mockLoadConfig = vi.mocked(loadConfig);

const BASE_OPTS = { format: "text" as const };

function makeBatchData(overrides: Partial<BatchPrData> = {}): BatchPrData {
  return {
    nodeId: "PR_kgDOAAA",
    number: 42,
    state: "OPEN",
    isDraft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "APPROVED",
    headRefOid: "abc123",
    baseRefName: "main",
    reviewRequests: [],
    latestReviews: [],
    reviewThreads: [],
    comments: [],
    changesRequestedReviews: [],
    reviewSummaries: [],
    approvedReviews: [],
    checks: [],
    ...overrides,
  };
}

function makeThread(overrides: Partial<ReviewThread> = {}): ReviewThread {
  return {
    id: "t-1",
    isResolved: false,
    isOutdated: false,
    isMinimized: false,
    path: "src/foo.ts",
    line: 1,
    startLine: null,
    author: "alice",
    body: "fix this",
    url: "",
    createdAtUnix: 1_700_000_000,
    ...overrides,
  };
}

function makeComment(overrides: Partial<PrComment> = {}): PrComment {
  return {
    id: "c-1",
    isMinimized: false,
    author: "bob",
    body: "nit",
    url: "",
    createdAtUnix: 1_700_000_000,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAutoResolveOutdated.mockResolvedValue({ resolved: [], errors: [] });
  mockApplyResolveOptions.mockResolvedValue({
    resolvedThreads: [],
    minimizedComments: [],
    dismissedReviews: [],
    errors: [],
  });
});

// ---------------------------------------------------------------------------
// runResolveFetch
// ---------------------------------------------------------------------------

describe("runResolveFetch — no PR", () => {
  it("throws when no open PR found", async () => {
    mockGetCurrentPrNumber.mockResolvedValueOnce(null);
    await expect(runResolveFetch(BASE_OPTS)).rejects.toThrow("No open PR found");
  });
});

describe("runResolveFetch — auto-resolves outdated threads", () => {
  it("calls autoResolveOutdated with outdated+unresolved thread IDs", async () => {
    const outdated = makeThread({ id: "outdated-1", isOutdated: true, isResolved: false });
    const resolved = makeThread({ id: "resolved-1", isOutdated: true, isResolved: true });
    const active = makeThread({ id: "active-1", isOutdated: false });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ reviewThreads: [outdated, resolved, active] }),
    });
    mockAutoResolveOutdated.mockResolvedValue({ resolved: ["outdated-1"], errors: [] });

    await runResolveFetch(BASE_OPTS);
    expect(mockAutoResolveOutdated).toHaveBeenCalledWith(["outdated-1"]);
  });

  it("logs to stderr and continues when autoResolveOutdated returns errors", async () => {
    const outdated = makeThread({ id: "outdated-1", isOutdated: true, isResolved: false });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [outdated] }) });
    mockAutoResolveOutdated.mockResolvedValue({ resolved: [], errors: ["rate limit hit"] });
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const result = await runResolveFetch(BASE_OPTS);

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("auto-resolve outdated threads failed"),
    );
    expect(result).toBeDefined();
    stderrSpy.mockRestore();
  });

  it("activeThreads excludes outdated threads", async () => {
    const outdated = makeThread({ id: "t-outdated", isOutdated: true });
    const active = makeThread({ id: "t-active", isOutdated: false });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ reviewThreads: [outdated, active] }),
    });

    const result = await runResolveFetch(BASE_OPTS);
    expect(result.actionableThreads.map((t) => t.id)).toEqual(["t-active"]);
  });

  it("attaches a parsed suggestion block to threads whose body contains one", async () => {
    const thread = makeThread({
      id: "t-with-suggestion",
      path: "src/foo.ts",
      line: 10,
      startLine: null,
      author: "reviewer",
      body: "Consider this change:\n\n```suggestion\nconst x = 42;\n```",
    });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [thread] }) });

    const result = await runResolveFetch(BASE_OPTS);
    expect(result.actionableThreads[0]?.suggestion).toEqual({
      startLine: 10,
      endLine: 10,
      lines: ["const x = 42;"],
      author: "reviewer",
    });
  });

  it("uses thread.startLine for multi-line suggestion ranges", async () => {
    const thread = makeThread({
      id: "t-multi",
      path: "src/foo.ts",
      line: 12,
      startLine: 10,
      body: "```suggestion\nA\nB\nC\n```",
    });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [thread] }) });

    const result = await runResolveFetch(BASE_OPTS);
    expect(result.actionableThreads[0]?.suggestion).toMatchObject({
      startLine: 10,
      endLine: 12,
      lines: ["A", "B", "C"],
    });
  });

  it('losslessly distinguishes deletion (lines: []) from blank-line replacement (lines: [""])', async () => {
    const deletion = makeThread({
      id: "t-del",
      path: "a.ts",
      line: 3,
      body: "```suggestion\n```",
    });
    const blank = makeThread({
      id: "t-blank",
      path: "b.ts",
      line: 3,
      body: "```suggestion\n\n```",
    });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ reviewThreads: [deletion, blank] }),
    });
    const result = await runResolveFetch(BASE_OPTS);
    const byId = Object.fromEntries(result.actionableThreads.map((t) => [t.id, t]));
    expect(byId["t-del"]!.suggestion?.lines).toEqual([]);
    expect(byId["t-blank"]!.suggestion?.lines).toEqual([""]);
  });

  it("omits suggestion for threads without a ```suggestion block", async () => {
    const thread = makeThread({
      id: "t-plain",
      path: "src/foo.ts",
      line: 5,
      body: "please rename this variable",
    });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [thread] }) });

    const result = await runResolveFetch(BASE_OPTS);
    expect(result.actionableThreads[0]?.suggestion).toBeUndefined();
  });

  it("omits suggestion for threads with no file/line anchor even when body has a suggestion block", async () => {
    const thread = makeThread({
      id: "t-no-anchor",
      path: null,
      line: null,
      body: "```suggestion\nconst x = 10;\n```",
    });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [thread] }) });

    const result = await runResolveFetch(BASE_OPTS);
    expect(result.actionableThreads[0]?.suggestion).toBeUndefined();
  });

  it("surfaces commitSuggestionsEnabled mirroring the config flag", async () => {
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({}) });
    const result = await runResolveFetch(BASE_OPTS);
    expect(result.commitSuggestionsEnabled).toBe(true);
  });

  it("actionableComments excludes minimized comments", async () => {
    const visible = makeComment({ id: "c-visible", isMinimized: false });
    const minimized = makeComment({ id: "c-min", isMinimized: true });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ comments: [visible, minimized] }) });

    const result = await runResolveFetch(BASE_OPTS);
    expect(result.actionableComments.map((c) => c.id)).toEqual(["c-visible"]);
  });

  it("actionableThreads excludes threads whose top comment is minimized", async () => {
    const visible = makeThread({ id: "t-visible", isMinimized: false });
    const minimized = makeThread({ id: "t-minimized", isMinimized: true });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ reviewThreads: [visible, minimized] }),
    });

    const result = await runResolveFetch(BASE_OPTS);
    expect(result.actionableThreads.map((t) => t.id)).toEqual(["t-visible"]);
  });

  it("surfaces reviewSummaries when fetchReviewSummaries is true", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewSummaries: [{ id: "PRR_1", author: "copilot", body: "overview" }],
      }),
    });

    const result = await runResolveFetch(BASE_OPTS);
    expect(result.reviewSummaries).toEqual([{ id: "PRR_1", author: "copilot", body: "overview" }]);
  });

  it("returns empty reviewSummaries when fetchReviewSummaries is false", async () => {
    mockLoadConfig.mockReturnValueOnce({
      resolve: {
        concurrency: 4,
        shaPoll: { intervalMs: 2000, maxAttempts: 10 },
        fetchReviewSummaries: false,
      },
      actions: {
        autoResolveOutdated: true,
        autoMarkReady: true,
        commitSuggestions: true,
      },
    } as ReturnType<typeof loadConfig>);
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewSummaries: [{ id: "PRR_1", author: "copilot", body: "overview" }],
      }),
    });

    const result = await runResolveFetch(BASE_OPTS);
    expect(result.reviewSummaries).toEqual([]);
  });

  it("includes prNumber in FetchResult", async () => {
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({}) });
    const result = await runResolveFetch(BASE_OPTS);
    expect(result.prNumber).toBe(42);
  });

  it("populates instructions as a non-empty string array", async () => {
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({}) });
    const result = await runResolveFetch(BASE_OPTS);
    expect(Array.isArray(result.instructions)).toBe(true);
    expect(result.instructions.length).toBeGreaterThan(0);
    expect(typeof result.instructions[0]).toBe("string");
  });

  it("instructions single step when no actionable items", async () => {
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({}) });
    const result = await runResolveFetch(BASE_OPTS);
    expect(result.instructions).toEqual([
      "No actionable items and no first-look items — end this invocation.",
    ]);
  });

  it("instructions include commit-suggestion step when enabled and suggestion present", async () => {
    const thread = makeThread({
      body: "```suggestion\nconst x = 1;\n```",
      path: "src/foo.ts",
      line: 5,
    });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [thread] }) });

    const result = await runResolveFetch(BASE_OPTS);
    const joined = result.instructions.join("\n");
    expect(joined).toContain("commit-suggestion");
    expect(joined).toContain("applied: true");
    expect(joined).toContain("applied: false");
    expect(joined).toContain("--dry-run");
  });

  it("instructions omit commit-suggestion step when commitSuggestionsEnabled is false", async () => {
    mockLoadConfig.mockReturnValueOnce({
      resolve: {
        concurrency: 4,
        shaPoll: { intervalMs: 2000, maxAttempts: 10 },
        fetchReviewSummaries: true,
      },
      actions: {
        autoResolveOutdated: true,
        autoMarkReady: true,
        commitSuggestions: false,
      },
    } as ReturnType<typeof loadConfig>);
    const thread = makeThread({
      body: "```suggestion\nconst x = 1;\n```",
      path: "src/foo.ts",
      line: 5,
    });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [thread] }) });

    const result = await runResolveFetch(BASE_OPTS);
    expect(result.instructions.join("\n")).not.toContain("commit-suggestion");
  });

  it("instructions include fix and commit/push steps when code items present (no suggestions)", async () => {
    const thread = makeThread({ body: "rename this" });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [thread] }) });

    const result = await runResolveFetch(BASE_OPTS);
    const joined = result.instructions.join("\n");
    expect(joined).not.toContain("commit-suggestion");
    expect(joined).toContain("git add");
    expect(joined).toContain("rebase");
    expect(joined).toContain("git push");
  });

  it("instructions dismissNote includes CHANGES_REQUESTED guidance when reviews present", async () => {
    const review = { id: "PRR_review1", author: "alice", body: "needs changes" };
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ changesRequestedReviews: [review] }),
    });

    const result = await runResolveFetch(BASE_OPTS);
    const joined = result.instructions.join("\n");
    // changesRequested note describes --dismiss-review-ids usage and --message requirement
    expect(joined).toContain("For `--dismiss-review-ids`");
    expect(joined).toContain("--message` is required");
    // also explains PRR_ routing (review-summary IDs go to --minimize-comment-ids, not dismiss)
    expect(joined).toContain("PRR_…");
  });

  it("instructions dismissNote mentions review-summary minimize guidance when reviewSummaries present but no changes-requested", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewSummaries: [{ id: "PRR_s1", author: "copilot", body: "summary" }],
      }),
    });

    const result = await runResolveFetch(BASE_OPTS);
    const joined = result.instructions.join("\n");
    expect(joined).toContain("--minimize-comment-ids");
    expect(joined).toContain("PRR_…");
    // summaries-only: no full --dismiss-review-ids guidance block
    expect(joined).not.toContain("For `--dismiss-review-ids`");
    // summaries have no file paths — fix/commit/push steps must not appear
    expect(joined).not.toContain("git add");
    expect(joined).not.toContain("git push");
  });

  it("instructions include Shepherd Journal step when there are actionable items", async () => {
    const thread = makeThread({ body: "fix this" });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [thread] }) });

    const result = await runResolveFetch(BASE_OPTS);
    expect(result.instructions.join("\n")).toContain("Shepherd Journal");
  });

  it("instructions omit Shepherd Journal step when there are no actionable items", async () => {
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({}) });
    const result = await runResolveFetch(BASE_OPTS);
    expect(result.instructions.join("\n")).not.toContain("Shepherd Journal");
  });
});

// ---------------------------------------------------------------------------
// runResolveMutate
// ---------------------------------------------------------------------------

describe("runResolveMutate — no PR", () => {
  it("throws when no open PR found", async () => {
    mockGetCurrentPrNumber.mockResolvedValueOnce(null);
    await expect(runResolveMutate(BASE_OPTS)).rejects.toThrow("No open PR found");
  });
});

describe("runResolveMutate — forwards options", () => {
  it("forwards all IDs and requireSha to applyResolveOptions", async () => {
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData() });
    await runResolveMutate({
      ...BASE_OPTS,
      resolveThreadIds: ["t-1"],
      minimizeCommentIds: ["c-1"],
      dismissReviewIds: ["r-1"],
      dismissMessage: "done",
      requireSha: "sha-abc",
    });
    expect(mockApplyResolveOptions).toHaveBeenCalledWith(
      42,
      { owner: "owner", name: "repo" },
      expect.objectContaining({
        resolveThreadIds: ["t-1"],
        minimizeCommentIds: ["c-1"],
        dismissReviewIds: ["r-1"],
        dismissMessage: "done",
        requireSha: "sha-abc",
      }),
    );
  });
});
