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
} from "./check.test-support.mts";
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
});
