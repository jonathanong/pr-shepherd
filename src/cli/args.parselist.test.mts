import { describe, it, expect } from "vitest";
import { parseList } from "./args.mts";

// ---------------------------------------------------------------------------
// parseIntStrict
// ---------------------------------------------------------------------------

describe("parseList", () => {
  it("splits comma-separated values and trims", () => {
    expect(parseList("a, b , c")).toEqual(["a", "b", "c"]);
  });

  it("returns empty array for null", () => {
    expect(parseList(null)).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseList("")).toEqual([]);
  });

  it("drops empty items after split", () => {
    expect(parseList("a,,b")).toEqual(["a", "b"]);
  });
});
