import { describe, it, expect } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  makeComment,
  makeThread,
  mockAutoResolveOutdated,
  mockFetchPrBatch,
  mockLoadSeenMap,
  mockMarkSeen,
} from "./resolve.test-support.mts";
import { hashBody } from "../state/seen-comments.mts";
import { runResolveFetch } from "./resolve.mts";
import { threadTranscriptBody } from "../threads/transcript.mts";

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

  it("does not auto-resolve outdated threads during fetch", async () => {
    const outdated = makeThread({ id: "t-auto", isOutdated: true });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [outdated] }) });
    mockAutoResolveOutdated.mockResolvedValue({ resolved: ["t-auto"], errors: [] });
    const result = await runResolveFetch(BASE_OPTS);
    expect(mockAutoResolveOutdated).not.toHaveBeenCalled();
    expect(result.firstLookThreads[0]?.autoResolved).toBeUndefined();
    expect(result.resolutionOnlyThreads.map((t) => t.id)).toEqual(["t-auto"]);
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

  it("re-surfaces a resolved thread when a reply is added after first look", async () => {
    const beforeReply = makeThread({
      id: "t-resolved",
      isResolved: true,
      body: "original",
      comments: [
        {
          id: "c-1",
          isMinimized: false,
          author: "alice",
          authorType: "User",
          body: "original",
          url: "https://github.com/o/r/pull/1#discussion_r1",
          createdAtUnix: 1,
        },
      ],
    });
    const afterReply = makeThread({
      ...beforeReply,
      comments: [
        ...beforeReply.comments!,
        {
          id: "c-2",
          isMinimized: false,
          author: "bob",
          authorType: "User",
          body: "new reply",
          url: "https://github.com/o/r/pull/1#discussion_r2",
          createdAtUnix: 2,
        },
      ],
    });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [afterReply] }) });
    mockLoadSeenMap.mockResolvedValue(
      new Map([
        ["t-resolved", { seenAt: 1000, bodyHash: hashBody(threadTranscriptBody(beforeReply)) }],
      ]),
    );

    const result = await runResolveFetch(BASE_OPTS);

    expect(result.firstLookThreads.map((t) => [t.id, t.edited])).toEqual([["t-resolved", true]]);
    expect(mockMarkSeen).toHaveBeenCalledWith(
      expect.any(Object),
      "t-resolved",
      threadTranscriptBody(afterReply),
    );
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
