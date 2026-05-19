import { describe, it, expect } from "vitest";
import { hasFlag } from "./args.mts";

// ---------------------------------------------------------------------------
// parseIntStrict
// ---------------------------------------------------------------------------

describe("hasFlag", () => {
  it("returns true when flag is present", () => {
    expect(hasFlag(["--dry-run", "42"], "--dry-run")).toBe(true);
  });

  it("returns false when flag is absent", () => {
    expect(hasFlag(["--format", "json"], "--dry-run")).toBe(false);
  });
});
