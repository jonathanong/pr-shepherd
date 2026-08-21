import { describe, expect, it } from "vitest";
import { isFailingCheckConclusion } from "./conclusions.mts";

describe("isFailingCheckConclusion", () => {
  it("treats GitHub failure conclusions as failing", () => {
    expect(isFailingCheckConclusion("FAILURE")).toBe(true);
    expect(isFailingCheckConclusion("TIMED_OUT")).toBe(true);
    expect(isFailingCheckConclusion("CANCELLED")).toBe(true);
    expect(isFailingCheckConclusion("STARTUP_FAILURE")).toBe(true);
    expect(isFailingCheckConclusion("ACTION_REQUIRED")).toBe(true);
    expect(isFailingCheckConclusion("STALE")).toBe(true);
  });

  it("treats success, skipped, and neutral as not failing", () => {
    expect(isFailingCheckConclusion("SUCCESS")).toBe(false);
    expect(isFailingCheckConclusion("SKIPPED")).toBe(false);
    expect(isFailingCheckConclusion("NEUTRAL")).toBe(false);
  });

  it("treats null conclusions as failing-check rows", () => {
    expect(isFailingCheckConclusion(null)).toBe(true);
    expect(isFailingCheckConclusion(undefined)).toBe(true);
  });
});
