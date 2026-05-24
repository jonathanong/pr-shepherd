import { describe, expect, it } from "vitest";

import { isConfiguredBotAuthor, normalizeBotUsernames } from "./authors.mts";

describe("isConfiguredBotAuthor", () => {
  it.each([
    [{ author: "github-actions", authorType: "Bot" as const }, [], true],
    [{ author: "github-actions[bot]", authorType: "User" as const }, [], true],
    [{ author: "CodeRabbitAI", authorType: "User" as const }, ["coderabbitai"], true],
    [{ author: "greptile-apps[bot]", authorType: "Unknown" as const }, ["greptile-apps"], true],
    [{ author: "alice", authorType: "User" as const }, ["coderabbitai"], false],
    [{ author: "unknown-app", authorType: "Unknown" as const }, ["coderabbitai"], false],
  ])("%o with %j -> %s", (author, botUsernames, expected) => {
    expect(isConfiguredBotAuthor(author, normalizeBotUsernames(botUsernames))).toBe(expected);
  });
});
