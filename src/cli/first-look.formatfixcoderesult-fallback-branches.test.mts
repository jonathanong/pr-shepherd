import { describe, it, expect } from "vitest";
import { formatFixCodeResult } from "./fix-formatter.mts";
import { makeIterateResult } from "../../fixtures/cli-parser.iterate-fixtures.mts";
import type { IterateResult } from "../types.mts";

// ---------------------------------------------------------------------------
// Cross-call-site identity assertion (issue #127 acceptance criterion)
//
// All three formatters must emit a byte-equal ## First-look items section
// for the same input.
// ---------------------------------------------------------------------------

describe("formatFixCodeResult — fallback branches", () => {
  it("renders missing locations, missing check metadata, cancelled checks, and empty review bodies", () => {
    const iterResult: IterateResult = { ...makeIterateResult("fix_code") };
    if (iterResult.action !== "fix_code") throw new Error("unreachable");
    iterResult.fix = {
      ...iterResult.fix,
      threads: [
        {
          id: "T_NO_LOC",
          path: null,
          line: null,
          startLine: undefined,
          author: "alice",
          authorType: "User",
          body: "thread body",
          url: "",
        },
      ],
      checks: [
        {
          name: "external-check",
          conclusion: null,
          detailsUrl: "https://checks.example/1",
          runId: null,
        },
        {
          name: "cancelled-check",
          jobName: "cancelled-job",
          conclusion: "CANCELLED",
          detailsUrl: null,
          runId: null,
          failedStep: "should not render",
          summary: "should not render",
        },
      ],
      firstLookSummaries: [{ id: "R_EMPTY", author: "reviewer", authorType: "User", body: "   " }],
      editedSummaries: [{ id: "R_EDITED_EMPTY", author: "reviewer", authorType: "User", body: "" }],
    };

    const output = formatFixCodeResult("# PR #42 [FIX_CODE]", iterResult);

    expect(output).toContain("(no location)");
    expect(output).toContain("external `https://checks.example/1`");
    expect(output).toContain("[conclusion: CANCELLED]");
    expect(output).not.toContain("should not render");
    expect(output).toContain("(no review body)");
  });
});
