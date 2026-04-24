import { describe, it, expect } from "vitest";
import { formatJson } from "./json.mts";
import type { ShepherdReport } from "../types.mts";

function makeReport(overrides: Partial<ShepherdReport> = {}): ShepherdReport {
  return {
    pr: 42,
    nodeId: "PR_kgDOAAA",
    repo: "owner/repo",
    status: "READY",
    baseBranch: "main",
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
    reviewSummaries: [],
    approvedReviews: [],
    ...overrides,
  };
}

describe("formatJson", () => {
  it("produces valid JSON containing all report fields", () => {
    const report = makeReport();
    const output = formatJson(report);
    const parsed = JSON.parse(output) as Record<string, unknown>;
    // instructions is added by the formatter; strip it before comparing
    const { instructions: _instructions, ...rest } = parsed;
    expect(rest).toEqual(report);
  });

  it("includes non-empty instructions array", () => {
    const output = formatJson(makeReport());
    const parsed = JSON.parse(output) as { instructions: unknown };
    expect(Array.isArray(parsed.instructions)).toBe(true);
    expect((parsed.instructions as string[]).length).toBeGreaterThan(0);
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

  it("instructions include monitoring pointer for non-READY PRs", () => {
    const output = formatJson(makeReport({ status: "FAILING" }));
    const parsed = JSON.parse(output) as { instructions: string[] };
    expect(parsed.instructions.some((s) => s.includes("/pr-shepherd:monitor"))).toBe(true);
  });
});
