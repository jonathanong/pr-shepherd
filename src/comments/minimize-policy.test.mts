import { describe, expect, it } from "vitest";

import { shouldMinimizeAuthor } from "./minimize-policy.mts";

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
});
