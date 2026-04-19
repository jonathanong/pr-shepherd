import { describe, it, expect } from "vitest";
import { formatJson } from "./json.mts";
import type { ShepherdReport } from "../types.mts";

function makeReport(overrides: Partial<ShepherdReport> = {}): ShepherdReport {
  return {
    pr: 42,
    repo: "owner/repo",
    status: "READY",
    mergeStatus: {
      status: "CLEAN",
      state: "OPEN",
      isDraft: false,
      mergeable: "MERGEABLE",
      reviewDecision: "APPROVED",
      copilotReviewInProgress: false,
      mergeStateStatus: "CLEAN",
    },
    checks: {
      passing: [],
      failing: [],
      inProgress: [],
      skipped: [],
      filtered: [],
      filteredNames: [],
      blockedByFilteredCheck: false,
    },
    threads: { actionable: [], autoResolved: [], autoResolveErrors: [] },
    comments: { actionable: [] },
    changesRequestedReviews: [],
    ...overrides,
  };
}

describe("formatJson", () => {
  it("produces valid JSON that round-trips to the original report", () => {
    const report = makeReport();
    const output = formatJson(report);
    expect(JSON.parse(output)).toEqual(report);
  });

  it("indents with 2 spaces", () => {
    const output = formatJson(makeReport());
    const lines = output.split("\n");
    // First property line of the JSON object is indented 2 spaces.
    expect(lines[1]).toMatch(/^ {2}"/);
  });

  it("preserves nested fields", () => {
    const report = makeReport({ status: "FAILING", pr: 99 });
    const parsed = JSON.parse(formatJson(report)) as ShepherdReport;
    expect(parsed.pr).toBe(99);
    expect(parsed.status).toBe("FAILING");
  });
});
