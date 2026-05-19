import { describe, it, expect } from "vitest";
import { statusToExitCode } from "./exit-codes.mts";

// ---------------------------------------------------------------------------
// parseIntStrict
// ---------------------------------------------------------------------------

describe("statusToExitCode", () => {
  it.each<[string, number]>([
    ["MERGED", 0],
    ["CLOSED", 0],
    ["READY", 0],
    ["IN_PROGRESS", 2],
    ["UNRESOLVED_COMMENTS", 3],
    ["FAILING", 1],
    ["UNKNOWN", 1],
    ["BLOCKED", 1],
  ])("%s → %d", (status, code) => {
    expect(statusToExitCode(status)).toBe(code);
  });
});
