// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  autoResolveOutdated,
  loadConfig,
  makeBatchData,
  makeThread,
  mockFetchPrBatch,
  mockLoadConfig,
  runResolveFetch,
} from "./resolve.test-support.mts";

registerHooks();

describe("runResolveFetch — auto-resolves outdated threads", () => {
  it("returns empty reviewSummaries when fetchReviewSummaries is false", async () => {
    mockLoadConfig.mockReturnValueOnce({
      resolve: { shaPoll: { intervalMs: 2000, maxAttempts: 10 }, fetchReviewSummaries: false },
      actions: { autoResolveOutdated: true, autoMarkReady: true, commitSuggestions: true },
    } as ReturnType<typeof loadConfig>);
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewSummaries: [
          { id: "PRR_1", author: "copilot", authorType: "Unknown" as const, body: "overview" },
        ],
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
    expect(joined).toContain("does not mutate the working tree");
  });
  it("instructions use configured package runner", async () => {
    mockLoadConfig.mockReturnValueOnce({
      resolve: { shaPoll: { intervalMs: 2000, maxAttempts: 10 }, fetchReviewSummaries: true },
      actions: { autoResolveOutdated: true, autoMarkReady: true, commitSuggestions: true },
      cli: { runner: "yarn" },
    } as ReturnType<typeof loadConfig>);
    const thread = makeThread({
      body: "```suggestion\nconst x = 1;\n```",
      path: "src/foo.ts",
      line: 5,
    });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [thread] }) });

    const result = await runResolveFetch(BASE_OPTS);
    const joined = result.instructions.join("\n");
    expect(joined).toContain("yarn run pr-shepherd commit-suggestion 42");
    expect(joined).toContain("yarn run pr-shepherd resolve 42");
  });
  it("instructions omit commit-suggestion step when commitSuggestionsEnabled is false", async () => {
    mockLoadConfig.mockReturnValueOnce({
      resolve: { shaPoll: { intervalMs: 2000, maxAttempts: 10 }, fetchReviewSummaries: true },
      actions: { autoResolveOutdated: true, autoMarkReady: true, commitSuggestions: false },
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
    const review = {
      id: "PRR_review1",
      author: "alice",
      authorType: "Unknown" as const,
      body: "needs changes",
    };
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
        reviewSummaries: [
          { id: "PRR_s1", author: "copilot", authorType: "Unknown" as const, body: "summary" },
        ],
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
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [makeThread()] }) });
    const result = await runResolveFetch(BASE_OPTS);
    const instructions = result.instructions.join("\n");
    expect(instructions).toContain("Shepherd Journal");
    expect(instructions.match(/## Shepherd Journal/g)?.length ?? 0).toBe(1);
  });
  it("instructions omit Shepherd Journal step when there are no actionable items", async () => {
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({}) });
    const result = await runResolveFetch(BASE_OPTS);
    expect(result.instructions.join("\n")).not.toContain("Shepherd Journal");
  });
});
