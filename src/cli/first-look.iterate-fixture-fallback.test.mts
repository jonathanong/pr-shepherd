import { describe, it, expect } from "vitest";
import { makeIterateResult } from "../cli-parser.iterate-fixtures.test-support.mts";

// ---------------------------------------------------------------------------
// Cross-call-site identity assertion (issue #127 acceptance criterion)
//
// All three formatters must emit a byte-equal ## First-look items section
// for the same input.
// ---------------------------------------------------------------------------

describe("iterate fixture fallback", () => {
  it("falls back to wait for unknown actions at runtime", () => {
    const result = makeIterateResult("unknown" as never);
    expect(result.action).toBe("wait");
  });
});
