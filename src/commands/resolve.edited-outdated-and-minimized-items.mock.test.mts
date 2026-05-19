import { describe, it, expect } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  loadConfig,
  makeBatchData,
  makeComment,
  makeThread,
  mockFetchPrBatch,
  mockLoadConfig,
  mockLoadSeenMap,
  mockMarkSeen,
} from "./resolve.test-support.mts";
import { hashBody } from "../state/seen-comments.mts";
import { runResolveFetch } from "./resolve.mts";

registerHooks();

describe("runResolveFetch — auto-resolves outdated threads", () => {
  it("re-surfaces edited outdated threads and edited minimized comments", async () => {
    const outdated = makeThread({
      id: "t-edited-outdated",
      isOutdated: true,
      isResolved: false,
      body: "new outdated body",
    });
    const minimizedComment = makeComment({
      id: "c-edited-min",
      isMinimized: true,
      body: "new minimized body",
    });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ reviewThreads: [outdated], comments: [minimizedComment] }),
    });
    mockLoadSeenMap.mockResolvedValue(
      new Map([
        ["t-edited-outdated", { seenAt: 1, bodyHash: hashBody("old outdated body") }],
        ["c-edited-min", { seenAt: 1, bodyHash: hashBody("old minimized body") }],
      ]),
    );

    const result = await runResolveFetch(BASE_OPTS);

    expect(result.firstLookThreads).toMatchObject([
      { id: "t-edited-outdated", firstLookStatus: "outdated", edited: true },
    ]);
    expect(result.firstLookComments).toMatchObject([
      { id: "c-edited-min", firstLookStatus: "minimized", edited: true },
    ]);
  });
  it("re-surfaces edited resolved and minimized threads", async () => {
    const resolved = makeThread({
      id: "t-edited-resolved",
      isResolved: true,
      isOutdated: false,
      body: "new resolved body",
    });
    const minimized = makeThread({
      id: "t-edited-min",
      isResolved: false,
      isOutdated: false,
      isMinimized: true,
      body: "new minimized body",
    });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ reviewThreads: [resolved, minimized] }),
    });
    mockLoadSeenMap.mockResolvedValue(
      new Map([
        ["t-edited-resolved", { seenAt: 1, bodyHash: hashBody("old resolved body") }],
        ["t-edited-min", { seenAt: 1, bodyHash: hashBody("old minimized body") }],
      ]),
    );

    const result = await runResolveFetch(BASE_OPTS);

    expect(result.firstLookThreads).toMatchObject([
      { id: "t-edited-resolved", firstLookStatus: "resolved", edited: true },
      { id: "t-edited-min", firstLookStatus: "minimized", edited: true },
    ]);
  });
  it("actionableComments excludes minimized comments", async () => {
    const visible = makeComment({ id: "c-visible", isMinimized: false });
    const minimized = makeComment({ id: "c-min", isMinimized: true });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ comments: [visible, minimized] }) });

    const result = await runResolveFetch(BASE_OPTS);
    expect(result.actionableComments.map((c) => c.id)).toEqual(["c-visible"]);
  });
  it("marker-gates visible comments excluded by minimizeComments policy", async () => {
    mockLoadConfig.mockReturnValueOnce({
      iterate: { minimizeComments: "bots" },
      resolve: { shaPoll: { intervalMs: 2000, maxAttempts: 10 }, fetchReviewSummaries: true },
      actions: { autoResolveOutdated: true, autoMarkReady: true, commitSuggestions: true },
    } as ReturnType<typeof loadConfig>);
    const human = makeComment({
      id: "c-human",
      authorType: "User",
      body: "human note",
    });
    const bot = makeComment({ id: "c-bot", authorType: "Bot", body: "bot note" });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ comments: [human, bot] }) });
    mockLoadSeenMap.mockResolvedValue(new Map());

    const result = await runResolveFetch(BASE_OPTS);

    expect(result.actionableComments.map((c) => c.id)).toEqual(["c-human", "c-bot"]);
    expect(mockMarkSeen).toHaveBeenCalledWith(expect.any(Object), "c-human", "human note");
    expect(mockMarkSeen).not.toHaveBeenCalledWith(expect.any(Object), "c-bot", expect.anything());
  });
  it("suppresses unchanged visible comments excluded by minimizeComments policy", async () => {
    mockLoadConfig.mockReturnValueOnce({
      iterate: { minimizeComments: "none" },
      resolve: { shaPoll: { intervalMs: 2000, maxAttempts: 10 }, fetchReviewSummaries: true },
      actions: { autoResolveOutdated: true, autoMarkReady: true, commitSuggestions: true },
    } as ReturnType<typeof loadConfig>);
    const comment = makeComment({ id: "c-human", authorType: "User", body: "seen" });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ comments: [comment] }) });
    mockLoadSeenMap.mockResolvedValue(
      new Map([["c-human", { seenAt: 1000, bodyHash: hashBody("seen") }]]),
    );

    const result = await runResolveFetch(BASE_OPTS);

    expect(result.actionableComments).toEqual([]);
  });
  it("re-surfaces edited visible comments excluded by minimizeComments policy", async () => {
    mockLoadConfig.mockReturnValueOnce({
      iterate: { minimizeComments: "none" },
      resolve: { shaPoll: { intervalMs: 2000, maxAttempts: 10 }, fetchReviewSummaries: true },
      actions: { autoResolveOutdated: true, autoMarkReady: true, commitSuggestions: true },
    } as ReturnType<typeof loadConfig>);
    const comment = makeComment({ id: "c-human", authorType: "User", body: "new note" });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ comments: [comment] }) });
    mockLoadSeenMap.mockResolvedValue(
      new Map([["c-human", { seenAt: 1000, bodyHash: hashBody("old note") }]]),
    );

    const result = await runResolveFetch(BASE_OPTS);

    expect(result.actionableComments).toMatchObject([{ id: "c-human", edited: true }]);
    expect(mockMarkSeen).toHaveBeenCalledWith(expect.any(Object), "c-human", "new note");
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
        reviewSummaries: [
          { id: "PRR_1", author: "copilot", authorType: "Unknown" as const, body: "overview" },
        ],
      }),
    });

    const result = await runResolveFetch(BASE_OPTS);
    expect(result.reviewSummaries).toEqual([
      { id: "PRR_1", author: "copilot", authorType: "Unknown" as const, body: "overview" },
    ]);
  });
});
