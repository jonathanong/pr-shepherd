import { describe, it, expect } from "vitest";
import { formatFixCodeResult } from "./fix-formatter.mts";
import { makeIterateResult } from "../cli-parser.iterate-fixtures.mts";
import type { IterateResult } from "../types.mts";

// ---------------------------------------------------------------------------
// Cross-call-site identity assertion (issue #127 acceptance criterion)
//
// All three formatters must emit a byte-equal ## First-look items section
// for the same input.
// ---------------------------------------------------------------------------

describe("## Review summaries (edited since first look) — fix-formatter rendering", () => {
  it("renders the edited-summaries section when editedSummaries is non-empty", () => {
    const editedSummary = {
      id: "PRR_ED",
      author: "reviewer",
      authorType: "Unknown" as const,
      body: "Updated review comment.",
    };
    const iterResult: IterateResult = { ...makeIterateResult("fix_code") };
    if (iterResult.action !== "fix_code") throw new Error("unreachable");
    iterResult.fix = { ...iterResult.fix, editedSummaries: [editedSummary] };
    const output = formatFixCodeResult("# PR #42 [FIX_CODE]", iterResult);
    expect(output).toContain(
      "## Review summaries (edited since first look — already minimized; do not re-minimize)",
    );
    expect(output).toContain("Updated review comment.");
    expect(output).toContain("PRR_ED");
  });
});
