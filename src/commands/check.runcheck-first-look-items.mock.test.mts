import { describe, it, expect } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  defaultConfig,
  makeBatchData,
  mockAutoResolveOutdated,
  mockFetchPrBatch,
  mockLoadConfig,
  mockLoadSeenMap,
  mockMarkSeen,
  makeThread,
  makeComment,
} from "./check.test-support.mts";
import { hashBody } from "../state/seen-comments.mts";
import { runCheck } from "./check.mts";

registerHooks();

describe("runCheck — first-look items", () => {
  it("surfaces unseen outdated thread in threads.firstLook", async () => {
    const outdated = makeThread({ id: "t-outdated", isOutdated: true });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [outdated] }) });
    mockLoadSeenMap.mockResolvedValue(new Map());
    const report = await runCheck(BASE_OPTS);
    expect(report.threads.firstLook).toHaveLength(1);
    expect(report.threads.firstLook[0]?.id).toBe("t-outdated");
    expect(report.threads.firstLook[0]?.firstLookStatus).toBe("outdated");
    expect(report.threads.firstLook[0]?.autoResolved).toBeUndefined();
  });
  it("does not auto-resolve outdated threads during check", async () => {
    const outdated = makeThread({ id: "t-auto", isOutdated: true });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [outdated] }) });
    mockLoadSeenMap.mockResolvedValue(new Map());
    mockAutoResolveOutdated.mockResolvedValue({ resolved: ["t-auto"], errors: [] });
    const report = await runCheck({ ...BASE_OPTS, autoResolve: true });
    expect(mockAutoResolveOutdated).not.toHaveBeenCalled();
    expect(report.threads.firstLook[0]?.autoResolved).toBeUndefined();
    expect(report.threads.resolutionOnly.map((t) => t.id)).toEqual(["t-auto"]);
  });
  it("surfaces unseen resolved thread in threads.firstLook", async () => {
    const resolved = makeThread({ id: "t-resolved", isResolved: true });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [resolved] }) });
    mockLoadSeenMap.mockResolvedValue(new Map());
    const report = await runCheck(BASE_OPTS);
    expect(report.threads.firstLook).toHaveLength(1);
    expect(report.threads.firstLook[0]?.firstLookStatus).toBe("resolved");
  });
  it("surfaces unseen minimized thread in threads.firstLook", async () => {
    const minimized = makeThread({ id: "t-minimized", isMinimized: true });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [minimized] }) });
    mockLoadSeenMap.mockResolvedValue(new Map());
    const report = await runCheck(BASE_OPTS);
    expect(report.threads.firstLook).toHaveLength(1);
    expect(report.threads.firstLook[0]?.firstLookStatus).toBe("minimized");
  });
  it("surfaces unseen minimized comment in comments.firstLook", async () => {
    const minimized = makeComment({ id: "c-min", isMinimized: true });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ comments: [minimized] }) });
    mockLoadSeenMap.mockResolvedValue(new Map());

    const report = await runCheck(BASE_OPTS);
    expect(report.comments.firstLook).toHaveLength(1);
    expect(report.comments.firstLook[0]?.firstLookStatus).toBe("minimized");
  });
  it("marker-gates visible comments excluded by minimizeComments policy", async () => {
    const cfg = defaultConfig();
    cfg.iterate.minimizeComments = "bots";
    mockLoadConfig.mockReturnValue(cfg);
    const human = makeComment({
      id: "c-human",
      author: "alice",
      authorType: "User",
      body: "please consider this",
    });
    const bot = makeComment({
      id: "c-bot",
      author: "app",
      authorType: "Bot",
      body: "automated note",
    });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ comments: [human, bot] }) });
    mockLoadSeenMap.mockResolvedValue(new Map());

    const report = await runCheck(BASE_OPTS);

    expect(report.comments.actionable.map((c) => c.id)).toEqual(["c-human", "c-bot"]);
    expect(report.comments.minimizeIds).toEqual(["c-bot"]);
    expect(mockMarkSeen).toHaveBeenCalledWith(
      expect.any(Object),
      "c-human",
      "please consider this",
    );
    expect(mockMarkSeen).not.toHaveBeenCalledWith(expect.any(Object), "c-bot", expect.anything());
  });
  it("suppresses unchanged visible comments excluded by minimizeComments policy", async () => {
    const cfg = defaultConfig();
    cfg.iterate.minimizeComments = "bots";
    mockLoadConfig.mockReturnValue(cfg);
    const human = makeComment({
      id: "c-human",
      authorType: "User",
      body: "already seen",
    });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ comments: [human] }) });
    mockLoadSeenMap.mockResolvedValue(
      new Map([["c-human", { seenAt: 1000, bodyHash: hashBody("already seen") }]]),
    );

    const report = await runCheck(BASE_OPTS);

    expect(report.comments.actionable).toEqual([]);
    expect(report.comments.minimizeIds).toEqual([]);
  });
  it("re-surfaces edited visible comments excluded by minimizeComments policy", async () => {
    const cfg = defaultConfig();
    cfg.iterate.minimizeComments = "none";
    mockLoadConfig.mockReturnValue(cfg);
    const comment = makeComment({ id: "c-human", authorType: "User", body: "new text" });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ comments: [comment] }) });
    mockLoadSeenMap.mockResolvedValue(
      new Map([["c-human", { seenAt: 1000, bodyHash: hashBody("old text") }]]),
    );

    const report = await runCheck(BASE_OPTS);

    expect(report.comments.actionable).toMatchObject([{ id: "c-human", edited: true }]);
    expect(report.comments.minimizeIds).toEqual([]);
    expect(mockMarkSeen).toHaveBeenCalledWith(expect.any(Object), "c-human", "new text");
  });
  it("suppresses already-seen items (unchanged hash)", async () => {
    const outdated = makeThread({ id: "t-outdated", isOutdated: true, body: "fix this" });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [outdated] }) });
    mockLoadSeenMap.mockResolvedValue(
      new Map([["t-outdated", { seenAt: 1000, bodyHash: hashBody("fix this") }]]),
    );

    const report = await runCheck(BASE_OPTS);
    expect(report.threads.firstLook).toHaveLength(0);
  });
  it("suppresses already-seen items (legacy marker without hash)", async () => {
    const outdated = makeThread({ id: "t-outdated", isOutdated: true });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [outdated] }) });
    mockLoadSeenMap.mockResolvedValue(new Map([["t-outdated", { seenAt: 1000 }]]));

    const report = await runCheck(BASE_OPTS);
    expect(report.threads.firstLook).toHaveLength(0);
  });
  it("re-surfaces edited item with edited: true", async () => {
    const outdated = makeThread({ id: "t-outdated", isOutdated: true, body: "new body" });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [outdated] }) });
    // Stored hash does NOT match current body → classified as "edited"
    mockLoadSeenMap.mockResolvedValue(
      new Map([["t-outdated", { seenAt: 1000, bodyHash: hashBody("old body") }]]),
    );

    const report = await runCheck(BASE_OPTS);
    expect(report.threads.firstLook).toHaveLength(1);
    expect(report.threads.firstLook[0]?.edited).toBe(true);
    expect(report.threads.firstLook[0]?.firstLookStatus).toBe("outdated");
  });
});
