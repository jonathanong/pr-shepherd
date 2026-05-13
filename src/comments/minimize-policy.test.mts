import { describe, expect, it } from "vitest";

import { shouldMinimizeAuthor } from "./minimize-policy.mts";

describe("shouldMinimizeAuthor", () => {
  it.each([
    [undefined, "Unknown", true],
    ["all", "User", true],
    ["bots", "Bot", true],
    ["bots", "User", false],
    ["users", "User", true],
    ["users", "Bot", false],
    ["none", "Bot", false],
  ] as const)("policy %s author %s -> %s", (policy, authorType, expected) => {
    expect(shouldMinimizeAuthor(authorType, policy)).toBe(expected);
  });

  it("throws for invalid runtime policies", () => {
    expect(() => shouldMinimizeAuthor("Bot", "bot" as never)).toThrow(
      "Invalid minimizeComments policy: bot",
    );
  });
});
