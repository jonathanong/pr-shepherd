import { describe, it, expect } from "vitest";
import { parseIntStrict } from "./args.mts";

// ---------------------------------------------------------------------------
// parseIntStrict
// ---------------------------------------------------------------------------

describe("parseIntStrict", () => {
  it("returns an integer for a valid integer string", () => {
    expect(parseIntStrict("42", "--flag")).toBe(42);
  });

  it("accepts negative integers", () => {
    expect(parseIntStrict("-5", "--flag")).toBe(-5);
  });

  it("throws for a float string like '10.5'", () => {
    expect(() => parseIntStrict("10.5", "--stall-timeout")).toThrow(
      'Invalid value for --stall-timeout: "10.5" is not an integer',
    );
  });

  it("throws for a partial integer like '10abc'", () => {
    expect(() => parseIntStrict("10abc", "--stall-timeout")).toThrow(
      'Invalid value for --stall-timeout: "10abc" is not an integer',
    );
  });

  it("throws for a non-numeric string", () => {
    expect(() => parseIntStrict("abc", "--stall-timeout")).toThrow(
      'Invalid value for --stall-timeout: "abc" is not an integer',
    );
  });
});
