import { describe, it, expect } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  defaultConfig,
  makeBatchData,
  makeThread,
  mockFetchPrBatch,
  mockLoadConfig,
  mockLoadSeenMap,
} from "../../test-helpers/commands/check.test-support.mts";
import { hashBody } from "../state/seen-comments.mts";
import { runCheck } from "./check.mts";

registerHooks();

describe("runCheck — unlocated and viewer-authored thread visibility", () => {
  it("skips an already-seen outdated unlocated thread when reply and resolve are unauthorized", async () => {
    mockLoadConfig.mockReturnValue(defaultConfig());
    const outdated = makeThread({
      id: "t-outdated-skipped",
      isOutdated: true,
      author: "reviewer",
      authorType: "User",
      body: "addressed feedback",
      path: "src/old.mts",
      line: null,
      viewerCanReply: false,
      viewerCanResolve: false,
    });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ reviewThreads: [outdated] }),
    });
    mockLoadSeenMap.mockResolvedValue(
      new Map([["t-outdated-skipped", { seenAt: 1000, bodyHash: hashBody("addressed feedback") }]]),
    );

    const report = await runCheck(BASE_OPTS);

    expect(report.threads.actionable).toEqual([]);
    expect(report.threads.firstLook).toEqual([]);
    expect(report.threads.resolutionOnly).toEqual([]);
  });

  it("keeps an already-seen outdated unlocated other-human thread as reply work", async () => {
    mockLoadConfig.mockReturnValue(defaultConfig());
    const outdated = makeThread({
      id: "t-outdated-human",
      isOutdated: true,
      author: "reviewer",
      authorType: "User",
      body: "addressed feedback",
      path: "src/old.mts",
      line: null,
    });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ reviewThreads: [outdated] }),
    });
    mockLoadSeenMap.mockResolvedValue(
      new Map([["t-outdated-human", { seenAt: 1000, bodyHash: hashBody("addressed feedback") }]]),
    );

    const report = await runCheck(BASE_OPTS);

    expect(report.threads.actionable).toEqual([]);
    expect(report.threads.resolutionOnly.map((thread) => thread.id)).toEqual(["t-outdated-human"]);
  });

  it("keeps an already-seen outdated unlocated viewer-authored thread as resolution-only work", async () => {
    mockLoadConfig.mockReturnValue(defaultConfig());
    const outdated = makeThread({
      id: "t-outdated-own",
      isOutdated: true,
      author: "alice",
      authorType: "User",
      viewerDidAuthor: true,
      body: "self review",
      path: "src/old.mts",
      line: null,
    });
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ reviewThreads: [outdated] }),
    });
    mockLoadSeenMap.mockResolvedValue(
      new Map([["t-outdated-own", { seenAt: 1000, bodyHash: hashBody("self review") }]]),
    );

    const report = await runCheck(BASE_OPTS);

    expect(report.threads.resolutionOnly.map((thread) => thread.id)).toEqual(["t-outdated-own"]);
  });

  it("keeps an already-seen viewer-authored active thread until resolved", async () => {
    mockLoadConfig.mockReturnValue(defaultConfig());
    const own = makeThread({
      id: "t-own",
      author: "alice",
      authorType: "User",
      viewerDidAuthor: true,
      body: "self review",
    });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [own] }) });
    mockLoadSeenMap.mockResolvedValue(
      new Map([["t-own", { seenAt: 1000, bodyHash: hashBody("self review") }]]),
    );

    const report = await runCheck(BASE_OPTS);

    expect(report.threads.actionable.map((t) => t.id)).toEqual(["t-own"]);
  });

  it.each([
    ["detected", "chatgpt-codex-connector", "Bot" as const, []],
    ["configured", "CodeRabbitAI", "User" as const, ["coderabbitai"]],
  ])(
    "keeps an already-seen outdated %s bot thread as resolution-only work without a line",
    async (_kind, author, authorType, botUsernames) => {
      const cfg = defaultConfig();
      cfg.botUsernames = botUsernames;
      mockLoadConfig.mockReturnValue(cfg);
      const outdated = makeThread({
        id: "t-outdated-bot",
        isOutdated: true,
        author,
        authorType,
        body: "addressed feedback",
        path: "src/old.mts",
        line: null,
        viewerCanResolve: true,
      });
      mockFetchPrBatch.mockResolvedValue({
        data: makeBatchData({
          mergeStateStatus: "BLOCKED",
          reviewThreads: [outdated],
        }),
      });
      mockLoadSeenMap.mockResolvedValue(
        new Map([["t-outdated-bot", { seenAt: 1000, bodyHash: hashBody("addressed feedback") }]]),
      );

      const report = await runCheck(BASE_OPTS);

      expect(report.status).toBe("PENDING");
      expect(report.threads.actionable).toEqual([]);
      expect(report.threads.firstLook).toEqual([]);
      expect(report.threads.resolutionOnly.map((thread) => thread.id)).toEqual(["t-outdated-bot"]);
    },
  );
});
