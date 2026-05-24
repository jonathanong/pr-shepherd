import { describe, expect, it } from "vitest";

import { shouldMinimizeAuthor } from "./minimize-policy.mts";
import { normalizeBotUsernames } from "./authors.mts";

describe("shouldMinimizeAuthor", () => {
  it.each([
    [undefined, "Unknown", "unknown", true],
    ["all", "User", "alice", false],
    ["all", "Unknown", "app", true],
    ["bots", "Bot", "app", true],
    ["bots", "User", "alice", false],
    ["users", "User", "alice", false],
    ["users", "Bot", "app", false],
    ["none", "Bot", "app", false],
    ["all", "Bot", "github-actions[bot]", true],
  ] as const)("policy %s author %s/%s -> %s", (policy, authorType, author, expected) => {
    expect(shouldMinimizeAuthor(authorType, policy, author)).toBe(expected);
  });

  it("throws for invalid runtime policies", () => {
    expect(() => shouldMinimizeAuthor("Bot", "bot" as never)).toThrow(
      "Invalid minimizeComments policy: bot",
    );
  });

  it("treats configured bot usernames as bots for minimization", () => {
    const botUsernames = normalizeBotUsernames(["coderabbitai"]);
    expect(shouldMinimizeAuthor("User", "bots", "CodeRabbitAI", botUsernames)).toBe(true);
    expect(shouldMinimizeAuthor("User", "all", "CodeRabbitAI", botUsernames)).toBe(true);
    expect(shouldMinimizeAuthor("User", "none", "CodeRabbitAI", botUsernames)).toBe(false);
  });
});
