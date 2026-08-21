import { describe, expect, it } from "vitest";
import { isFailingAgentCheck } from "./conclusions.mts";

describe("isFailingAgentCheck", () => {
  it("treats GitHub failure conclusions as failing", () => {
    expect(isFailingAgentCheck({ conclusion: "FAILURE" })).toBe(true);
    expect(isFailingAgentCheck({ conclusion: "TIMED_OUT" })).toBe(true);
    expect(isFailingAgentCheck({ conclusion: "CANCELLED" })).toBe(true);
    expect(isFailingAgentCheck({ conclusion: "STARTUP_FAILURE" })).toBe(true);
    expect(isFailingAgentCheck({ conclusion: "ACTION_REQUIRED" })).toBe(true);
    expect(isFailingAgentCheck({ conclusion: "STALE" })).toBe(true);
    expect(isFailingAgentCheck({ conclusion: null })).toBe(true);
  });

  it("treats success, skipped, and neutral as not failing", () => {
    expect(isFailingAgentCheck({ conclusion: "SUCCESS" })).toBe(false);
    expect(isFailingAgentCheck({ conclusion: "SKIPPED" })).toBe(false);
    expect(isFailingAgentCheck({ conclusion: "NEUTRAL" })).toBe(false);
  });

  it("excludes annotation-only carriers even when the conclusion is failing", () => {
    expect(isFailingAgentCheck({ conclusion: "FAILURE", annotationOnly: true })).toBe(false);
  });
});
