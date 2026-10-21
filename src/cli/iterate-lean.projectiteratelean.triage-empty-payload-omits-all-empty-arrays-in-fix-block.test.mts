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

  it("triage (empty payload): omits all empty arrays in fix block", () => {
    const lean = projectIterateLean(makeIterateResult("triage")) as Record<string, unknown>;
    expect(lean.action).toBe("triage");
    expect(lean.checks).toBeUndefined();
    const triage = lean.triage as Record<string, unknown>;
    expect(triage.threads).toBeUndefined();
    expect(triage.actionableComments).toBeUndefined();
    expect(triage.reviewSummaryIds).toBeUndefined();
    expect(triage.surfacedApprovals).toBeUndefined();
    expect(triage.firstLookThreads).toBeUndefined();
    expect(triage.firstLookComments).toBeUndefined();
    expect(triage.checks).toBeUndefined();
    expect(triage.changesRequestedReviews).toBeUndefined();
    // fixture has one default instruction ("End this iteration."), so it is present
    expect((triage.instructions as unknown[]).length).toBe(1);
    // resolveCommand always present
    expect(triage.resolveCommand).toBeDefined();
  });
  it("triage: omits editedSummaries when empty", () => {
    const lean = projectIterateLean(makeIterateResult("triage")) as Record<string, unknown>;
    expect((lean.triage as Record<string, unknown>).editedSummaries).toBeUndefined();
  });
  it("triage: includes editedSummaries when non-empty", () => {
    const result = makeIterateResult("triage");
    if (result.action !== "triage") throw new Error("unreachable");
    result.triage.editedSummaries = [
      { id: "PRR_ED", author: "reviewer", authorType: "Unknown" as const, body: "updated" },
    ];
    const lean = projectIterateLean(result) as Record<string, unknown>;
    expect(((lean.triage as Record<string, unknown>).editedSummaries as unknown[]).length).toBe(1);
  });
  it("triage (rich payload): includes non-empty arrays, omits empty ones", () => {
    const result = makeIterateResult("triage");
    if (result.action !== "triage") throw new Error("unreachable");
    result.triage.threads = [
      { id: "t1", path: "src/x.ts", line: 1, author: "a", body: "fix", url: "" },
    ];
    result.triage.checks = [
      { name: "ci", runId: "r1", detailsUrl: null, conclusion: "FAILURE" as const },
    ];
    result.triage.instructions = ["step 1"];
    result.triage.actionableComments = [
      { id: "c1", author: "a", authorType: "Unknown" as const, body: "nit", url: "" },
    ];
    result.triage.reviewSummaryIds = ["r1"];
    result.triage.resolutionOnlyThreads = [
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
    result.triage.firstLookSummaries = [
      { id: "summary-1", author: "a", authorType: "Unknown" as const, body: "summary" },
    ];
    result.triage.surfacedApprovals = [
      { id: "s1", author: "a", authorType: "Unknown" as const, body: "summary" },
    ];
    result.triage.firstLookThreads = [
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
    result.triage.firstLookComments = [
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
    result.triage.changesRequestedReviews = [
      { id: "rv1", author: "a", authorType: "Unknown" as const, body: "" },
    ];
    result.checks = [
      { name: "lint", conclusion: "FAILURE" as const, runId: "r2", detailsUrl: null },
    ];

    const lean = projectIterateLean(result) as Record<string, unknown>;
    const triage = lean.triage as Record<string, unknown>;
    expect((triage.threads as unknown[]).length).toBe(1);
    expect((triage.resolutionOnlyThreads as unknown[]).length).toBe(1);
    expect((triage.checks as unknown[]).length).toBe(1);
    expect(lean.checks).toBeUndefined();
    expect((triage.instructions as unknown[]).length).toBe(1);
    expect((triage.actionableComments as unknown[]).length).toBe(1);
    expect((triage.reviewSummaryIds as unknown[]).length).toBe(1);
    expect((triage.firstLookSummaries as unknown[]).length).toBe(1);
    expect((triage.surfacedApprovals as unknown[]).length).toBe(1);
    expect((triage.firstLookThreads as unknown[]).length).toBe(1);
    expect((triage.firstLookComments as unknown[]).length).toBe(1);
    expect((triage.changesRequestedReviews as unknown[]).length).toBe(1);
  });
  it("projectIterateVerbose passes triage instructions through unchanged (no recheck appended)", () => {
    const result = makeIterateResult("triage");
    if (result.action !== "triage") throw new Error("unreachable");
    result.triage.instructions = ["`[TRIAGE]` is non-terminal. Continue with the next poll."];
    const verbose = projectIterateVerbose(result, {}) as typeof result;
    expect(verbose.triage.instructions).toEqual(result.triage.instructions);
    expect(verbose.triage.instructions[0]).not.toContain("rerun");
  });
  it("projectIterateVerbose surfaces a --ready-delay override as readyDelayOverride", () => {
    const result = makeIterateResult("triage");
    const verbose = projectIterateVerbose(result, { readyDelaySuffix: "15m" }) as Record<
      string,
      unknown
    >;
    expect(verbose.readyDelayOverride).toBe("15m");
  });
  it("projectIterateVerbose adapts non-fix logs and adds instructions", () => {
    const verbose = projectIterateVerbose(makeIterateResult("wait"), {}) as Record<string, unknown>;
    expect(verbose.log).toContain("WAIT");
    expect(verbose.instructions).toBeDefined();
  });
});
