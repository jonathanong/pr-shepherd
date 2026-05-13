// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerHooks,
  makeIterateResult,
  projectIterateLean,
} from "./iterate-lean.test-support.mts";

describe("projectIterateLean", () => {
  // ---------------------------------------------------------------------------
  // Base field gating
  // ---------------------------------------------------------------------------

  it("omits shouldCancel regardless of value", () => {
    const result = makeIterateResult("wait");
    const lean = projectIterateLean(result) as Record<string, unknown>;
    expect(lean.shouldCancel).toBeUndefined();
  });
  it("omits blockingBotReviewInProgress when false", () => {
    const lean = projectIterateLean(makeIterateResult("wait")) as Record<string, unknown>;
    expect(lean.blockingBotReviewInProgress).toBeUndefined();
  });
  it("includes blockingBotReviewInProgress: true when set", () => {
    const result = { ...makeIterateResult("wait"), blockingBotReviewInProgress: true };
    const lean = projectIterateLean(result) as Record<string, unknown>;
    expect(lean.blockingBotReviewInProgress).toBe(true);
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
    const result = { ...makeIterateResult("wait"), repo: "" };
    const lean = projectIterateLean(result) as Record<string, unknown>;
    expect(lean.repo).toBeUndefined();
  });
  it("omits baseBranch when empty string", () => {
    const result = { ...makeIterateResult("wait"), baseBranch: "" };
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
  it("omits reviewDecision when mergeStatus is not BLOCKED", () => {
    const result = {
      ...makeIterateResult("wait"),
      mergeStateStatus: "CLEAN" as const,
      mergeStatus: "CLEAN" as const,
      reviewDecision: "APPROVED" as const,
    };
    const lean = projectIterateLean(result) as Record<string, unknown>;
    expect(lean.reviewDecision).toBeUndefined();
  });
  it("omits reviewDecision when BLOCKED but null", () => {
    // fixture already has mergeStatus=BLOCKED, reviewDecision=null
    const lean = projectIterateLean(makeIterateResult("wait")) as Record<string, unknown>;
    expect(lean.reviewDecision).toBeUndefined();
  });
  it("includes reviewDecision when BLOCKED (BLOCKED raw) and non-null", () => {
    const result = { ...makeIterateResult("wait"), reviewDecision: "REVIEW_REQUIRED" as const };
    const lean = projectIterateLean(result) as Record<string, unknown>;
    expect(lean.reviewDecision).toBe("REVIEW_REQUIRED");
  });
  it("includes reviewDecision=APPROVED when BLOCKED with insufficient approvals", () => {
    const result = { ...makeIterateResult("wait"), reviewDecision: "APPROVED" as const };
    const lean = projectIterateLean(result) as Record<string, unknown>;
    expect(lean.reviewDecision).toBe("APPROVED");
  });
  it("includes reviewDecision when mergeStatus=BLOCKED from HAS_HOOKS raw", () => {
    const result = {
      ...makeIterateResult("wait"),
      mergeStateStatus: "HAS_HOOKS" as const,
      mergeStatus: "BLOCKED" as const,
      reviewDecision: "REVIEW_REQUIRED" as const,
    };
    const lean = projectIterateLean(result) as Record<string, unknown>;
    expect(lean.reviewDecision).toBe("REVIEW_REQUIRED");
  });
  it("omits reviewDecision when HAS_HOOKS raw but mergeStatus=BLOCKED and null reviewDecision", () => {
    const result = {
      ...makeIterateResult("wait"),
      mergeStateStatus: "HAS_HOOKS" as const,
      mergeStatus: "BLOCKED" as const,
      reviewDecision: null,
    };
    const lean = projectIterateLean(result) as Record<string, unknown>;
    expect(lean.reviewDecision).toBeUndefined();
  });
  it("wait: includes log, omits checks", () => {
    const lean = projectIterateLean(makeIterateResult("wait")) as Record<string, unknown>;
    expect(lean.action).toBe("wait");
    expect(lean.log).toContain("WAIT");
    expect(lean.checks).toBeUndefined();
  });
  it("cancel: includes reason and log", () => {
    const lean = projectIterateLean(makeIterateResult("cancel")) as Record<string, unknown>;
    expect(lean.action).toBe("cancel");
    expect(lean.reason).toBe("ready-delay-elapsed");
    expect(lean.log).toContain("CANCEL");
    expect(lean.checks).toBeUndefined();
  });
  it("mark_ready: drops markedReady, includes log", () => {
    const lean = projectIterateLean(makeIterateResult("mark_ready")) as Record<string, unknown>;
    expect(lean.action).toBe("mark_ready");
    expect(lean.markedReady).toBeUndefined();
    expect(lean.log).toContain("MARKED READY");
    expect(lean.checks).toBeUndefined();
  });
});
