import { describe, expect, it } from "vitest";
import { makeIterateResult } from "../../fixtures/cli-parser.iterate-fixtures.mts";
import { formatIterateResult } from "./iterate-formatter.mts";
import { projectIterateLean } from "./iterate-lean.mts";

describe("disabled automatic mark-ready output", () => {
  it("surfaces a terminal draft stop in text and JSON without continuation instructions", () => {
    const result = { ...makeIterateResult("cancel", "auto-mark-ready-disabled"), isDraft: true };
    const text = formatIterateResult(result);
    const lean = projectIterateLean(result);

    expect(lean).toMatchObject({
      action: "cancel",
      reason: "auto-mark-ready-disabled",
      isDraft: true,
    });
    expect(text).toContain("[CANCEL]");
    expect(text).toContain("auto-mark-ready-disabled");
    expect(text).not.toContain("## Instructions");
    expect(text).not.toContain("--stack");
    expect(lean).not.toHaveProperty("instructions");
    expect(lean).not.toHaveProperty("nextCheck");
  });
});
