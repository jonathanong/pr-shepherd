import { describe, it, expect } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  defaultConfig,
  makeBatchData,
  mockFetchPrBatch,
  mockLoadConfig,
  mockLoadSeenMap,
  mockMarkSeen,
  makeComment,
} from "../../test-helpers/commands/check.test-support.mts";
import { hashBody } from "../state/seen-comments.mts";
import { runCheck } from "./check.mts";

registerHooks();

describe("runCheck — first-look comments", () => {
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
    expect(mockMarkSeen).toHaveBeenCalledWith(expect.any(Object), "c-bot", "automated note");
  });
  it("suppresses minimized bot comment that was already seen as actionable", async () => {
    const cfg = defaultConfig();
    cfg.iterate.minimizeComments = "bots";
    mockLoadConfig.mockReturnValue(cfg);
    const bot = makeComment({
      id: "c-bot",
      author: "app",
      authorType: "Bot",
      body: "automated note",
      isMinimized: true,
    });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ comments: [bot] }) });
    mockLoadSeenMap.mockResolvedValue(
      new Map([["c-bot", { seenAt: 1000, bodyHash: hashBody("automated note") }]]),
    );

    const report = await runCheck(BASE_OPTS);

    expect(report.comments.firstLook).toEqual([]);
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
});
