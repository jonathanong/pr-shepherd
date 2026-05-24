import { describe, it, expect } from "vitest";
import {
  makeIterateResult,
  projectIterateLean,
  projectIterateVerbose,
} from "../../test-helpers/cli/iterate-lean.test-support.mts";

describe("projectIterateLean", () => {
  // ---------------------------------------------------------------------------
  // Base field gating
  // ---------------------------------------------------------------------------

  it("fix_code (empty payload): omits all empty arrays in fix block", () => {
    const lean = projectIterateLean(makeIterateResult("fix_code")) as Record<string, unknown>;
    expect(lean.action).toBe("fix_code");
    expect(lean.cancelled).toBeUndefined();
    expect(lean.checks).toBeUndefined();
    const fix = lean.fix as Record<string, unknown>;
    expect(fix.threads).toBeUndefined();
    expect(fix.actionableComments).toBeUndefined();
    expect(fix.reviewSummaryIds).toBeUndefined();
    expect(fix.surfacedApprovals).toBeUndefined();
    expect(fix.firstLookThreads).toBeUndefined();
    expect(fix.firstLookComments).toBeUndefined();
    expect(fix.checks).toBeUndefined();
    expect(fix.changesRequestedReviews).toBeUndefined();
    // fixture has one default instruction ("End this iteration."), so it is present
    expect((fix.instructions as unknown[]).length).toBe(1);
    // resolveCommand always present
    expect(fix.resolveCommand).toBeDefined();
  });
  it("fix_code: omits editedSummaries when empty", () => {
    const lean = projectIterateLean(makeIterateResult("fix_code")) as Record<string, unknown>;
    expect((lean.fix as Record<string, unknown>).editedSummaries).toBeUndefined();
  });
  it("fix_code: includes editedSummaries when non-empty", () => {
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code") throw new Error("unreachable");
    result.fix.editedSummaries = [
      { id: "PRR_ED", author: "reviewer", authorType: "Unknown" as const, body: "updated" },
    ];
    const lean = projectIterateLean(result) as Record<string, unknown>;
    expect(((lean.fix as Record<string, unknown>).editedSummaries as unknown[]).length).toBe(1);
  });
  it("fix_code (rich payload): includes non-empty arrays, omits empty ones", () => {
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code") throw new Error("unreachable");
    result.fix.threads = [
      { id: "t1", path: "src/x.ts", line: 1, author: "a", body: "fix", url: "" },
    ];
    result.fix.checks = [
      { name: "ci", runId: "r1", detailsUrl: null, conclusion: "FAILURE" as const },
    ];
    result.fix.instructions = ["step 1"];
    result.fix.actionableComments = [
      { id: "c1", author: "a", authorType: "Unknown" as const, body: "nit", url: "" },
    ];
    result.fix.reviewSummaryIds = ["r1"];
    result.fix.resolutionOnlyThreads = [
      {
        id: "t-resolve",
        path: "src/old.ts",
        line: 2,
        startLine: null,
        author: "a",
        authorType: "Unknown" as const,
        body: "old",
        url: "",
        isResolved: false,
        isOutdated: true,
        isMinimized: false,
        createdAtUnix: 0,
      },
    ];
    result.fix.firstLookSummaries = [
      { id: "summary-1", author: "a", authorType: "Unknown" as const, body: "summary" },
    ];
    result.fix.surfacedApprovals = [
      { id: "s1", author: "a", authorType: "Unknown" as const, body: "summary" },
    ];
    result.fix.firstLookThreads = [
      {
        id: "t2",
        path: "src/y.ts",
        line: 5,
        author: "b",
        authorType: "Unknown" as const,
        body: "note",
        url: "",
        isResolved: false,
        isOutdated: true,
        isMinimized: false,
        startLine: null,
        createdAtUnix: 0,
        firstLookStatus: "outdated",
      },
    ];
    result.fix.firstLookComments = [
      {
        id: "c3",
        author: "b",
        authorType: "Unknown" as const,
        body: "old",
        url: "",
        isMinimized: true,
        createdAtUnix: 0,
        firstLookStatus: "minimized",
      },
    ];
    result.fix.changesRequestedReviews = [
      { id: "rv1", author: "a", authorType: "Unknown" as const, body: "" },
    ];
    result.checks = [
      { name: "lint", conclusion: "FAILURE" as const, runId: "r2", detailsUrl: null },
    ];
    result.cancelled = ["run-1"];
    result.fix.inProgressRunIds = ["run-2"];

    const lean = projectIterateLean(result) as Record<string, unknown>;
    const fix = lean.fix as Record<string, unknown>;
    expect((fix.threads as unknown[]).length).toBe(1);
    expect((fix.resolutionOnlyThreads as unknown[]).length).toBe(1);
    expect((fix.checks as unknown[]).length).toBe(1);
    expect((lean.checks as unknown[]).length).toBe(1);
    expect((fix.instructions as unknown[]).length).toBe(1);
    expect((fix.actionableComments as unknown[]).length).toBe(1);
    expect((fix.reviewSummaryIds as unknown[]).length).toBe(1);
    expect((fix.firstLookSummaries as unknown[]).length).toBe(1);
    expect((fix.surfacedApprovals as unknown[]).length).toBe(1);
    expect((fix.firstLookThreads as unknown[]).length).toBe(1);
    expect((fix.firstLookComments as unknown[]).length).toBe(1);
    expect((fix.inProgressRunIds as unknown[]).length).toBe(1);
    expect((fix.changesRequestedReviews as unknown[]).length).toBe(1);
    expect((lean.cancelled as unknown[]).length).toBe(1);
  });
  it("projectIterateVerbose adapts fix_code instructions", () => {
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code") throw new Error("unreachable");
    result.fix.instructions = [
      "Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick.",
    ];
    const verbose = projectIterateVerbose(result, {}) as typeof result;
    expect(verbose.fix.instructions[0]).toContain("rerun `pr-shepherd 42`");
  });
  it("projectIterateVerbose adapts non-fix logs and adds instructions", () => {
    const verbose = projectIterateVerbose(makeIterateResult("wait"), {}) as Record<string, unknown>;
    expect(verbose.log).toContain("WAIT");
    expect(verbose.instructions).toBeDefined();
  });
});
