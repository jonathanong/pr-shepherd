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

describe("runCheck — configured bot thread visibility", () => {
  it("keeps returning already-seen configured bot active threads", async () => {
    const cfg = defaultConfig();
    cfg.botUsernames = ["coderabbitai"];
    mockLoadConfig.mockReturnValue(cfg);
    const active = makeThread({
      id: "t-bot",
      author: "CodeRabbitAI",
      authorType: "User",
      body: "active feedback",
    });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [active] }) });
    mockLoadSeenMap.mockResolvedValue(
      new Map([["t-bot", { seenAt: 1000, bodyHash: hashBody("active feedback") }]]),
    );

    const report = await runCheck(BASE_OPTS);

    expect(report.threads.actionable.map((t) => t.id)).toEqual(["t-bot"]);
  });

  it("skips an already-seen configured bot thread when resolution is unauthorized", async () => {
    const cfg = defaultConfig();
    cfg.botUsernames = ["coderabbitai"];
    mockLoadConfig.mockReturnValue(cfg);
    const active = makeThread({
      id: "t-bot",
      author: "CodeRabbitAI",
      authorType: "User",
      body: "active feedback",
      viewerCanResolve: false,
    });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [active] }) });
    mockLoadSeenMap.mockResolvedValue(
      new Map([["t-bot", { seenAt: 1000, bodyHash: hashBody("active feedback") }]]),
    );

    const report = await runCheck(BASE_OPTS);

    expect(report.threads.actionable).toEqual([]);
  });

  it("skips an already-seen active configured bot thread without a source location", async () => {
    const cfg = defaultConfig();
    cfg.botUsernames = ["coderabbitai"];
    mockLoadConfig.mockReturnValue(cfg);
    const active = makeThread({
      id: "t-bot",
      author: "CodeRabbitAI",
      authorType: "User",
      body: "active feedback",
      path: null,
      line: null,
    });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [active] }) });
    mockLoadSeenMap.mockResolvedValue(
      new Map([["t-bot", { seenAt: 1000, bodyHash: hashBody("active feedback") }]]),
    );

    const report = await runCheck(BASE_OPTS);

    expect(report.threads.actionable).toEqual([]);
    expect(report.threads.resolutionOnly).toEqual([]);
  });

  it.each([
    ["human", "reviewer", "User" as const, true],
    ["unauthorized bot", "chatgpt-codex-connector", "Bot" as const, false],
  ])(
    "skips an already-seen outdated unlocated %s thread",
    async (_kind, author, authorType, viewerCanResolve) => {
      mockLoadConfig.mockReturnValue(defaultConfig());
      const outdated = makeThread({
        id: "t-outdated-skipped",
        isOutdated: true,
        author,
        authorType,
        body: "addressed feedback",
        path: "src/old.mts",
        line: null,
        viewerCanResolve,
      });
      mockFetchPrBatch.mockResolvedValue({
        data: makeBatchData({ reviewThreads: [outdated] }),
      });
      mockLoadSeenMap.mockResolvedValue(
        new Map([
          ["t-outdated-skipped", { seenAt: 1000, bodyHash: hashBody("addressed feedback") }],
        ]),
      );

      const report = await runCheck(BASE_OPTS);

      expect(report.threads.actionable).toEqual([]);
      expect(report.threads.firstLook).toEqual([]);
      expect(report.threads.resolutionOnly).toEqual([]);
    },
  );

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
