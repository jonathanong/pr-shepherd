// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerIterateHooks } from "./iterate-test-support.mts";
import { buildFixInstructions } from "./iterate/render.mts";

registerIterateHooks();

describe("buildFixInstructions", () => {
  it("adds edited guidance for edited first-look threads", () => {
    const instructions = buildFixInstructions(
      [],
      [],
      [],
      [],
      "main",
      {
        argv: ["npx", "pr-shepherd", "resolve", "42"],
        requiresHeadSha: false,
        requiresDismissMessage: false,
        hasMutations: false,
      },
      false,
      42,
      0,
      [
        {
          id: "t-edited",
          isResolved: false,
          isOutdated: true,
          isMinimized: false,
          path: "src/a.ts",
          line: 1,
          startLine: null,
          author: "reviewer",
          authorType: "User",
          body: "updated",
          url: "",
          createdAtUnix: 0,
          firstLookStatus: "outdated",
          edited: true,
        },
      ],
    );

    expect(instructions.join("\n")).toContain("were updated by their author");
  });
});
