import { describe, it, expect } from "vitest";
import { projectIterateLean } from "./iterate-lean.mts";
import { makeIterateResult } from "../cli-parser.iterate-fixtures.mts";
import type { IterateResult } from "../types.mts";

describe("projectIterateLean", () => {
  // ---------------------------------------------------------------------------
  // Base field gating
  // ---------------------------------------------------------------------------

  it("omits shouldCancel regardless of value", () => {
    const result = makeIterateResult("wait");
    const lean = projectIterateLean(result) as Record<string, unknown>;
    expect(lean.shouldCancel).toBeUndefined();
  });

  it("omits copilotReviewInProgress when false", () => {
    const lean = projectIterateLean(makeIterateResult("wait")) as Record<string, unknown>;
    expect(lean.copilotReviewInProgress).toBeUndefined();
  });

  it("includes copilotReviewInProgress: true when set", () => {
    const result = { ...makeIterateResult("wait"), copilotReviewInProgress: true };
    const lean = projectIterateLean(result) as Record<string, unknown>;
    expect(lean.copilotReviewInProgress).toBe(true);
  });

  it("omits isDraft when false", () => {
    const lean = projectIterateLean(makeIterateResult("wait")) as Record<string, unknown>;
    expect(lean.isDraft).toBeUndefined();
  });

  it("includes isDraft: true when set", () => {
    const result = { ...makeIterateResult("wait"), isDraft: true };
    const lean = projectIterateLean(result) as Record<string, unknown>;
    expect(lean.isDraft).toBe(true);
  });

  it("omits repo when empty string", () => {
    const result = { ...makeIterateResult("cooldown"), repo: "" };
    const lean = projectIterateLean(result) as Record<string, unknown>;
    expect(lean.repo).toBeUndefined();
  });

  it("omits baseBranch when empty string", () => {
    const result = { ...makeIterateResult("cooldown"), baseBranch: "" };
    const lean = projectIterateLean(result) as Record<string, unknown>;
    expect(lean.baseBranch).toBeUndefined();
  });

  it("omits remainingSeconds when status != READY", () => {
    // fixture: status=IN_PROGRESS, remainingSeconds=60
    const lean = projectIterateLean(makeIterateResult("wait")) as Record<string, unknown>;
    expect(lean.remainingSeconds).toBeUndefined();
  });

  it("includes remainingSeconds when status=READY and > 0", () => {
    const result = {
      ...makeIterateResult("wait"),
      status: "READY" as const,
      remainingSeconds: 300,
    };
    const lean = projectIterateLean(result) as Record<string, unknown>;
    expect(lean.remainingSeconds).toBe(300);
  });

  it("omits remainingSeconds when READY but 0", () => {
    const result = { ...makeIterateResult("wait"), status: "READY" as const, remainingSeconds: 0 };
    const lean = projectIterateLean(result) as Record<string, unknown>;
    expect(lean.remainingSeconds).toBeUndefined();
  });

  it("omits zero summary counts, keeps non-zero", () => {
    const result = makeIterateResult("wait"); // skipped=0, filtered=0, inProgress=1
    const lean = projectIterateLean(result) as Record<string, unknown>;
    const summary = lean.summary as Record<string, unknown>;
    expect(summary.passing).toBe(0);
    expect(summary.skipped).toBeUndefined();
    expect(summary.filtered).toBeUndefined();
    expect(summary.inProgress).toBe(1);
  });

  it("includes non-zero skipped and filtered counts", () => {
    const result = {
      ...makeIterateResult("wait"),
      summary: { passing: 2, skipped: 1, filtered: 3, inProgress: 0 },
    };
    const lean = projectIterateLean(result) as Record<string, unknown>;
    const summary = lean.summary as Record<string, unknown>;
    expect(summary.passing).toBe(2);
    expect(summary.skipped).toBe(1);
    expect(summary.filtered).toBe(3);
    expect(summary.inProgress).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // cooldown
  // ---------------------------------------------------------------------------

  it("cooldown: includes log, omits checks", () => {
    const result = makeIterateResult("cooldown");
    const lean = projectIterateLean(result) as Record<string, unknown>;
    expect(lean.action).toBe("cooldown");
    expect(lean.log).toBe("SKIP: CI still starting");
    expect(lean.checks).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // wait
  // ---------------------------------------------------------------------------

  it("wait: includes log, omits checks", () => {
    const lean = projectIterateLean(makeIterateResult("wait")) as Record<string, unknown>;
    expect(lean.action).toBe("wait");
    expect(lean.log).toContain("WAIT");
    expect(lean.checks).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // cancel
  // ---------------------------------------------------------------------------

  it("cancel: includes reason and log", () => {
    const lean = projectIterateLean(makeIterateResult("cancel")) as Record<string, unknown>;
    expect(lean.action).toBe("cancel");
    expect(lean.reason).toBe("ready-delay-elapsed");
    expect(lean.log).toContain("CANCEL");
    expect(lean.checks).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // rerun_ci
  // ---------------------------------------------------------------------------

  it("rerun_ci: includes reran, omits checks when empty", () => {
    const lean = projectIterateLean(makeIterateResult("rerun_ci")) as Record<string, unknown>;
    expect(lean.action).toBe("rerun_ci");
    expect(lean.reran).toBeDefined();
    expect(lean.checks).toBeUndefined();
  });

  it("rerun_ci: includes checks when non-empty", () => {
    const result = {
      ...makeIterateResult("rerun_ci"),
      checks: [
        {
          name: "lint",
          conclusion: "FAILURE" as const,
          runId: "r1",
          detailsUrl: null,
          failureKind: "timeout" as const,
        },
      ],
    } as IterateResult;
    const lean = projectIterateLean(result) as Record<string, unknown>;
    expect((lean.checks as unknown[]).length).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // mark_ready
  // ---------------------------------------------------------------------------

  it("mark_ready: drops markedReady, includes log", () => {
    const lean = projectIterateLean(makeIterateResult("mark_ready")) as Record<string, unknown>;
    expect(lean.action).toBe("mark_ready");
    expect(lean.markedReady).toBeUndefined();
    expect(lean.log).toContain("MARKED READY");
    expect(lean.checks).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // fix_code
  // ---------------------------------------------------------------------------

  it("fix_code (empty payload): omits all empty arrays in fix block", () => {
    const lean = projectIterateLean(makeIterateResult("fix_code")) as Record<string, unknown>;
    expect(lean.action).toBe("fix_code");
    expect(lean.cancelled).toBeUndefined();
    expect(lean.checks).toBeUndefined();
    const fix = lean.fix as Record<string, unknown>;
    expect(fix.threads).toBeUndefined();
    expect(fix.actionableComments).toBeUndefined();
    expect(fix.noiseCommentIds).toBeUndefined();
    expect(fix.reviewSummaryIds).toBeUndefined();
    expect(fix.surfacedSummaries).toBeUndefined();
    expect(fix.checks).toBeUndefined();
    expect(fix.changesRequestedReviews).toBeUndefined();
    // fixture has one default instruction ("End this iteration."), so it is present
    expect((fix.instructions as unknown[]).length).toBe(1);
    // resolveCommand always present
    expect(fix.resolveCommand).toBeDefined();
  });

  it("fix_code (rich payload): includes non-empty arrays, omits empty ones", () => {
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code") throw new Error("unreachable");
    result.fix.threads = [{ id: "t1", path: "src/x.ts", line: 1, author: "a", body: "fix" }];
    result.fix.checks = [{ name: "ci", runId: "r1", detailsUrl: null, failureKind: "actionable" }];
    result.fix.instructions = ["step 1"];
    result.fix.actionableComments = [{ id: "c1", author: "a", body: "nit" }];
    result.fix.noiseCommentIds = ["c2"];
    result.fix.reviewSummaryIds = ["r1"];
    result.fix.surfacedSummaries = [{ id: "s1", author: "a", body: "summary" }];
    result.fix.changesRequestedReviews = [{ id: "rv1", author: "a", body: "" }];
    result.checks = [
      {
        name: "lint",
        conclusion: "FAILURE" as const,
        runId: "r2",
        detailsUrl: null,
        failureKind: "timeout" as const,
      },
    ];
    result.cancelled = ["run-1"];

    const lean = projectIterateLean(result) as Record<string, unknown>;
    const fix = lean.fix as Record<string, unknown>;
    expect((fix.threads as unknown[]).length).toBe(1);
    expect((fix.checks as unknown[]).length).toBe(1);
    expect((lean.checks as unknown[]).length).toBe(1);
    expect((fix.instructions as unknown[]).length).toBe(1);
    expect((fix.actionableComments as unknown[]).length).toBe(1);
    expect((fix.noiseCommentIds as unknown[]).length).toBe(1);
    expect((fix.reviewSummaryIds as unknown[]).length).toBe(1);
    expect((fix.surfacedSummaries as unknown[]).length).toBe(1);
    expect((fix.changesRequestedReviews as unknown[]).length).toBe(1);
    expect((lean.cancelled as unknown[]).length).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // escalate
  // ---------------------------------------------------------------------------

  it("escalate (empty arrays): omits triggers and all empty arrays", () => {
    const lean = projectIterateLean(makeIterateResult("escalate")) as Record<string, unknown>;
    expect(lean.action).toBe("escalate");
    const esc = lean.escalate as Record<string, unknown>;
    expect(esc.triggers).toBeUndefined();
    expect(esc.unresolvedThreads).toBeUndefined();
    expect(esc.ambiguousComments).toBeUndefined();
    expect(esc.changesRequestedReviews).toBeUndefined();
    expect(esc.attemptHistory).toBeUndefined();
    expect(esc.suggestion).toBe("check manually");
    expect(esc.humanMessage).toBeDefined();
  });

  it("escalate (non-empty arrays): includes triggers and populated arrays", () => {
    const result = makeIterateResult("escalate");
    if (result.action !== "escalate") throw new Error("unreachable");
    result.escalate.triggers = ["fix-thrash"];
    result.escalate.unresolvedThreads = [
      { id: "t1", path: "f.ts", line: 1, author: "a", body: "b" },
    ];
    result.escalate.ambiguousComments = [{ id: "c1", author: "a", body: "?" }];
    result.escalate.changesRequestedReviews = [{ id: "rv1", author: "a", body: "" }];
    result.escalate.attemptHistory = [{ threadId: "t1", attempts: 3 }];

    const lean = projectIterateLean(result) as Record<string, unknown>;
    const esc = lean.escalate as Record<string, unknown>;
    expect((esc.triggers as unknown[]).length).toBe(1);
    expect((esc.unresolvedThreads as unknown[]).length).toBe(1);
    expect((esc.ambiguousComments as unknown[]).length).toBe(1);
    expect((esc.changesRequestedReviews as unknown[]).length).toBe(1);
    expect((esc.attemptHistory as unknown[]).length).toBe(1);
  });
});
