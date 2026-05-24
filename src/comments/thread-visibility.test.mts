import { describe, expect, it } from "vitest";
import { classifyThreadVisibility } from "./thread-visibility.mts";
import { hashBody } from "../state/seen-comments.mts";
import type { ReviewThread } from "../types.mts";

function makeThread(overrides: Partial<ReviewThread> = {}): ReviewThread {
  return {
    id: "thread-1",
    isResolved: false,
    isOutdated: false,
    isMinimized: false,
    path: "src/foo.mts",
    line: 10,
    startLine: null,
    author: "reviewer",
    authorType: "User",
    body: "body",
    url: "",
    createdAtUnix: 1,
    ...overrides,
  };
}

describe("classifyThreadVisibility", () => {
  it("dedupes toMarkSeen while preserving first surfaced order", () => {
    const active = makeThread({ id: "active" });
    const outdated = makeThread({ id: "outdated", isOutdated: true });
    const duplicateOutdated = makeThread({ id: "outdated", isOutdated: true });

    const result = classifyThreadVisibility([active, outdated, duplicateOutdated], new Map());

    expect(result.toMarkSeen.map((t) => t.id)).toEqual(["active", "outdated"]);
  });

  it("suppresses unchanged active human threads", () => {
    const human = makeThread({ id: "human", authorType: "User", body: "already handled" });
    const seenMap = new Map([["human", { seenAt: 1000, bodyHash: hashBody("already handled") }]]);

    const result = classifyThreadVisibility([human], seenMap, ["coderabbitai"]);

    expect(result.activeThreads).toEqual([]);
  });

  it("keeps returning unresolved detected bot threads even when unchanged", () => {
    const bot = makeThread({ id: "bot", authorType: "Bot", body: "still unresolved" });
    const seenMap = new Map([["bot", { seenAt: 1000, bodyHash: hashBody("still unresolved") }]]);

    const result = classifyThreadVisibility([bot], seenMap);

    expect(result.activeThreads.map((t) => t.id)).toEqual(["bot"]);
  });

  it("keeps returning configured reviewer bot threads reported as User", () => {
    const bot = makeThread({
      id: "configured-bot",
      author: "CodeRabbitAI",
      authorType: "User",
      body: "still unresolved",
    });
    const seenMap = new Map([
      ["configured-bot", { seenAt: 1000, bodyHash: hashBody("still unresolved") }],
    ]);

    const result = classifyThreadVisibility([bot], seenMap, ["coderabbitai"]);

    expect(result.activeThreads.map((t) => t.id)).toEqual(["configured-bot"]);
  });

  it("does not keep returning resolved bot threads after first look", () => {
    const bot = makeThread({
      id: "resolved-bot",
      isResolved: true,
      authorType: "Bot",
      body: "already resolved",
    });
    const seenMap = new Map([
      ["resolved-bot", { seenAt: 1000, bodyHash: hashBody("already resolved") }],
    ]);

    const result = classifyThreadVisibility([bot], seenMap);

    expect(result.activeThreads).toEqual([]);
    expect(result.firstLookThreads).toEqual([]);
  });

  it("suppresses stale pre-reply transcript markers for human threads", () => {
    const human = makeThread({ id: "human", authorType: "User", body: "reviewer body" });
    const seenMap = new Map([
      [
        "human",
        {
          seenAt: 1000,
          bodyHash: hashBody("reviewer body\n\n--- thread comment ---\n\nshepherd reply"),
          previousBodyHash: hashBody("reviewer body"),
        },
      ],
    ]);

    const result = classifyThreadVisibility([human], seenMap);

    expect(result.activeThreads).toEqual([]);
  });
});
