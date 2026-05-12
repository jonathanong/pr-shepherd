import { describe, expect, it } from "vitest";

import { shouldMinimizeAuthor } from "./minimize-policy.mts";

describe("shouldMinimizeAuthor", () => {
  it("throws for invalid runtime policies", () => {
    expect(() => shouldMinimizeAuthor("Bot", "bot" as never)).toThrow(
      "Invalid minimizeComments policy: bot",
    );
  });
});
