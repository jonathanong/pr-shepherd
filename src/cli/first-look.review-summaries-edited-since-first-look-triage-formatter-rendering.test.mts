import { describe, it, expect } from "vitest";
import { formatTriageResult } from "./triage-formatter.mts";
import { makeIterateResult } from "../../fixtures/cli-parser.iterate-fixtures.mts";
import type { IterateResult } from "../types.mts";

// ---------------------------------------------------------------------------
// Cross-call-site identity assertion (issue #127 acceptance criterion)
//
// All three formatters must emit a byte-equal ## First-look items section
// for the same input.
// ---------------------------------------------------------------------------

describe("## Review summaries (edited since first look) — triage-formatter rendering", () => {
  it("renders the edited-summaries section when editedSummaries is non-empty", () => {
    const editedSummary = {
      id: "PRR_ED",
      author: "reviewer",
      authorType: "Unknown" as const,
      body: "Updated review comment.",
    };
    const iterResult: IterateResult = { ...makeIterateResult("triage") };
    if (iterResult.action !== "triage") throw new Error("unreachable");
    iterResult.triage = { ...iterResult.triage, editedSummaries: [editedSummary] };
    const output = formatTriageResult("# PR #42 [TRIAGE]", iterResult);
    expect(output).toContain(
      "## Review summaries (edited since first look — already minimized; do not re-minimize)",
    );
    expect(output).toContain("Updated review comment.");
    expect(output).toContain("PRR_ED");
  });
});
