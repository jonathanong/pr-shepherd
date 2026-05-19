import { describe, it, expect } from "vitest";
import { getFlag } from "./args.mts";

// ---------------------------------------------------------------------------
// parseIntStrict
// ---------------------------------------------------------------------------

describe("getFlag", () => {
  it("returns value for --flag value form", () => {
    expect(getFlag(["--format", "json"], "--format")).toBe("json");
  });

  it("returns value for --flag=value form", () => {
    expect(getFlag(["--format=json"], "--format")).toBe("json");
  });

  it("returns null when flag is absent", () => {
    expect(getFlag(["--dry-run"], "--format")).toBeNull();
  });

  it("returns null when flag is last arg with no value", () => {
    expect(getFlag(["--format"], "--format")).toBeNull();
  });
});
