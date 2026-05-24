import { describe, it, expect } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  makeThread,
  mockLoadConfig,
  mockFetchPrBatch,
  mockLoadSeenMap,
  mockMarkSeen,
} from "./resolve.test-support.mts";
import { hashBody } from "../state/seen-comments.mts";
import { runResolveFetch } from "./resolve.mts";

registerHooks();

describe("runResolveFetch — active thread markers", () => {
  it("surfaces unseen active thread and marks it seen", async () => {
    const active = makeThread({ id: "t-active", body: "active feedback" });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [active] }) });
    mockLoadSeenMap.mockResolvedValue(new Map());

    const result = await runResolveFetch(BASE_OPTS);

    expect(result.actionableThreads.map((t) => t.id)).toEqual(["t-active"]);
    expect(mockMarkSeen).toHaveBeenCalledWith(expect.any(Object), "t-active", "active feedback");
  });

  it("suppresses unchanged active thread after first look", async () => {
    const active = makeThread({ id: "t-active", body: "active feedback" });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [active] }) });
    mockLoadSeenMap.mockResolvedValue(
      new Map([["t-active", { seenAt: 1000, bodyHash: hashBody("active feedback") }]]),
    );

    const result = await runResolveFetch(BASE_OPTS);

    expect(result.actionableThreads).toEqual([]);
  });

  it("keeps returning unchanged configured bot active threads", async () => {
    mockLoadConfig.mockReturnValue({
      botUsernames: ["coderabbitai"],
      resolve: {
        shaPoll: { intervalMs: 2000, maxAttempts: 10 },
        fetchReviewSummaries: true,
      },
      actions: {
        autoResolveOutdated: true,
        autoMarkReady: true,
        commitSuggestions: true,
      },
      iterate: {
        fixAttemptsPerThread: 3,
        stallTimeoutMinutes: 60,
        minimizeApprovals: false,
        minimizeComments: "all",
      },
      watch: { readyDelayMinutes: 10 },
      checks: { ciTriggerEvents: ["pull_request", "pull_request_target"] },
      mergeStatus: { blockingReviewerLogins: ["copilot"] },
    });
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

    const result = await runResolveFetch(BASE_OPTS);

    expect(result.actionableThreads.map((t) => t.id)).toEqual(["t-bot"]);
  });

  it("re-surfaces edited active thread", async () => {
    const active = makeThread({ id: "t-active", body: "updated active feedback" });
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [active] }) });
    mockLoadSeenMap.mockResolvedValue(
      new Map([["t-active", { seenAt: 1000, bodyHash: hashBody("old active feedback") }]]),
    );

    const result = await runResolveFetch(BASE_OPTS);

    expect(result.actionableThreads).toMatchObject([{ id: "t-active", edited: true }]);
    expect(mockMarkSeen).toHaveBeenCalledWith(
      expect.any(Object),
      "t-active",
      "updated active feedback",
    );
  });
});
