// @ts-nocheck
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  getFlag,
  hasFlag,
  parseList,
  parseStatusPrNumbers,
  parseCommonArgs,
  parseIntStrict,
} from "./args.mts";
import {
  parseDurationToMinutes,
  statusToExitCode,
  iterateActionToExitCode,
} from "./exit-codes.mts";
import { validateDurationFlag } from "./duration-flag.mts";
import { isDefaultIterateInvocation, validateDefaultIterateArgs } from "./default-iterate.mts";
import type { ShepherdAction } from "../types.mts";

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
