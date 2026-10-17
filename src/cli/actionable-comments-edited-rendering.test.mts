import { describe, expect, it } from "vitest";
import { formatTriageResult } from "./triage-formatter.mts";
import { makeIterateResult } from "../../fixtures/cli-parser.iterate-fixtures.mts";

describe("edited actionable comment rendering", () => {
  it("renders edited actionable comments in triage output", () => {
    const result = makeIterateResult("triage");
    if (result.action !== "triage") throw new Error("expected triage fixture");
    result.triage = {
      ...result.triage,
      actionableComments: [
        {
          id: "c-edited",
          author: "alice",
          authorType: "User",
          body: "Updated note.",
          url: "",
          edited: true,
        },
      ],
      instructions: ["Items marked `[edited since first look]` were updated by their author."],
    };

    const out = formatTriageResult("# PR #42 [TRIAGE]", result);

    expect(out).toContain("### `commentId=c-edited` (@alice) [edited since first look]");
    expect(out).toContain("Items marked `[edited since first look]`");
  });
});
