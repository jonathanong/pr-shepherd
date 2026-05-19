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
import type { ShepherdAction } from "../types.mts";

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
