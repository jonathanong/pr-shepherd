import { describe, expect, it } from "vitest";
import { classifyVisibleComments } from "./visible-comments.mts";
import { hashBody } from "../state/seen-comments.mts";
import type { PrComment } from "../types.mts";
import { normalizeBotUsernames } from "./authors.mts";

function makeComment(overrides: Partial<PrComment> = {}): PrComment {
  return {
    id: "c-1",
    isMinimized: false,
    author: "alice",
    authorType: "User",
    body: "body",
    url: "",
    createdAtUnix: 0,
    ...overrides,
  };
}

describe("classifyVisibleComments", () => {
  it("queues auto-minimized comments and marks them seen", () => {
    const comment = makeComment({ id: "c-bot", authorType: "Bot" });

    const result = classifyVisibleComments([comment], new Map(), "bots");

    expect(result.actionable).toEqual([comment]);
    expect(result.minimizeIds).toEqual(["c-bot"]);
    expect(result.toMarkSeen).toEqual([comment]);
  });

  it("queues configured bot comments and marks them seen", () => {
    const comment = makeComment({
      id: "c-bot",
      author: "CodeRabbitAI",
      authorType: "User",
    });

    const result = classifyVisibleComments(
      [comment],
      new Map(),
      "bots",
      normalizeBotUsernames(["coderabbitai"]),
    );

    expect(result.actionable).toEqual([comment]);
    expect(result.minimizeIds).toEqual(["c-bot"]);
    expect(result.toMarkSeen).toEqual([comment]);
  });

  it("returns new non-auto-minimized comments and marks them seen", () => {
    const comment = makeComment({ id: "c-human", authorType: "User" });

    const result = classifyVisibleComments([comment], new Map(), "bots");

    expect(result.actionable).toEqual([comment]);
    expect(result.minimizeIds).toEqual([]);
    expect(result.toMarkSeen).toEqual([comment]);
  });

  it("suppresses unchanged non-auto-minimized comments", () => {
    const comment = makeComment({ id: "c-human", body: "already seen" });
    const seenMap = new Map([["c-human", { seenAt: 1000, bodyHash: hashBody("already seen") }]]);

    const result = classifyVisibleComments([comment], seenMap, "none");

    expect(result.actionable).toEqual([]);
    expect(result.minimizeIds).toEqual([]);
    expect(result.toMarkSeen).toEqual([]);
  });

  it("re-surfaces edited non-auto-minimized comments", () => {
    const comment = makeComment({ id: "c-human", body: "new body" });
    const seenMap = new Map([["c-human", { seenAt: 1000, bodyHash: hashBody("old body") }]]);

    const result = classifyVisibleComments([comment], seenMap, "none");

    expect(result.actionable).toEqual([{ ...comment, edited: true }]);
    expect(result.minimizeIds).toEqual([]);
    expect(result.toMarkSeen).toEqual([{ ...comment, edited: true }]);
  });
});
