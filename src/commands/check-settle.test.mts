import { describe, expect, it } from "vitest";
import { headStillSettling } from "./check-settle.mts";

const base = { hasChecks: false, actionsWorkflowInProgress: false, nowUnix: 1_000 };

describe("headStillSettling", () => {
  it("holds a head younger than the window", () => {
    expect(headStillSettling({ ...base, headFreshAtUnix: 1_000 - 5 })).toBe(true);
    expect(headStillSettling({ ...base, headFreshAtUnix: 1_000 - 59 })).toBe(true);
  });

  it("releases a head at or past the window", () => {
    expect(headStillSettling({ ...base, headFreshAtUnix: 1_000 - 60 })).toBe(false);
  });

  it("never holds when the age is unknown, a check exists, or Actions is running", () => {
    expect(headStillSettling({ ...base })).toBe(false);
    expect(headStillSettling({ ...base, hasChecks: true, headFreshAtUnix: 999 })).toBe(false);
    expect(
      headStillSettling({ ...base, actionsWorkflowInProgress: true, headFreshAtUnix: 999 }),
    ).toBe(false);
  });
});
