// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  makeComment,
  makeThread,
  markSeen,
  mockAutoResolveOutdated,
  mockFetchPrBatch,
  mockLoadSeenMap,
  mockMarkSeen,
} from "./resolve.test-support.mts";
import { hashBody } from "../state/seen-comments.mts";
import { runResolveFetch } from "./resolve.mts";

registerHooks();

describe("runResolveFetch — first-look items", () => {
  it.each([
    ["outdated", makeThread({ id: "t-outdated", isOutdated: true }), "outdated"],
    ["resolved", makeThread({ id: "t-resolved", isResolved: true }), "resolved"],
    ["minimized", makeThread({ id: "t-minimized", isMinimized: true }), "minimized"],
  ])("surfaces unseen %s thread in firstLookThreads", async (_label, thread, status) => {
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [thread] }) });
    const result = await runResolveFetch(BASE_OPTS);
    expect(result.firstLookThreads[0]?.firstLookStatus).toBe(status);
  });

  it("marks auto-resolved outdated thread with autoResolved: true", async () => {
    const outdated = makeThread({ id: "t-auto", isOutdated: true });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [outdated] }) });
    mockAutoResolveOutdated.mockResolvedValue({ resolved: ["t-auto"], errors: [] });
    const result = await runResolveFetch(BASE_OPTS);
    expect(result.firstLookThreads[0]?.autoResolved).toBe(true);
    expect(result.resolutionOnlyThreads).toHaveLength(0);
  });

  it("surfaces unseen minimized comment in firstLookComments", async () => {
    const minimized = makeComment({ id: "c-min", isMinimized: true });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ comments: [minimized] }) });
    const result = await runResolveFetch(BASE_OPTS);
    expect(result.firstLookComments[0]?.firstLookStatus).toBe("minimized");
  });

  it("re-surfaces edited resolved and minimized threads", async () => {
    const resolved = makeThread({
      id: "t-resolved",
      isResolved: true,
      body: "new resolved body",
    });
    const minimized = makeThread({
      id: "t-minimized",
      isMinimized: true,
      body: "new minimized body",
    });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ reviewThreads: [resolved, minimized] }),
    });
    mockLoadSeenMap.mockResolvedValue(
      new Map([
        ["t-resolved", { seenAt: 1000, bodyHash: hashBody("old resolved body") }],
        ["t-minimized", { seenAt: 1000, bodyHash: hashBody("old minimized body") }],
      ]),
    );

    const result = await runResolveFetch(BASE_OPTS);

    expect(result.firstLookThreads.map((t) => [t.id, t.firstLookStatus, t.edited])).toEqual([
      ["t-resolved", "resolved", true],
      ["t-minimized", "minimized", true],
    ]);
  });

  it("suppresses already-seen items and calls markSeen for new ones", async () => {
    const outdated = makeThread({ id: "t-outdated", isOutdated: true, body: "fix this" });
    const minimized = makeComment({ id: "c-min", isMinimized: true, body: "nit" });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ reviewThreads: [outdated], comments: [minimized] }),
    });
    // Stored hash matches outdated body → unchanged (suppress)
    mockLoadSeenMap.mockResolvedValue(
      new Map([["t-outdated", { seenAt: 1000, bodyHash: hashBody("fix this") }]]),
    );
    const result = await runResolveFetch(BASE_OPTS);
    expect(result.firstLookThreads).toHaveLength(0);
    expect(mockMarkSeen).toHaveBeenCalledWith(expect.any(Object), "c-min", "nit");
  });

  it("suppresses unchanged resolved/minimized threads and minimized comments", async () => {
    const resolved = makeThread({ id: "t-resolved", isResolved: true, body: "resolved" });
    const minimizedThread = makeThread({
      id: "t-minimized",
      isMinimized: true,
      body: "minimized thread",
    });
    const minimizedComment = makeComment({
      id: "c-minimized",
      isMinimized: true,
      body: "minimized comment",
    });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewThreads: [resolved, minimizedThread],
        comments: [minimizedComment],
      }),
    });
    mockLoadSeenMap.mockResolvedValue(
      new Map([
        ["t-resolved", { seenAt: 1000, bodyHash: hashBody("resolved") }],
        ["t-minimized", { seenAt: 1000, bodyHash: hashBody("minimized thread") }],
        ["c-minimized", { seenAt: 1000, bodyHash: hashBody("minimized comment") }],
      ]),
    );

    const result = await runResolveFetch(BASE_OPTS);

    expect(result.firstLookThreads).toEqual([]);
    expect(result.firstLookComments).toEqual([]);
  });
});
