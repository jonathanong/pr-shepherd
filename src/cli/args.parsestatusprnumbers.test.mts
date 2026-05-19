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

describe("parseStatusPrNumbers", () => {
  it("extracts positional PR numbers", () => {
    expect(parseStatusPrNumbers(["42", "99"])).toEqual([42, 99]);
  });

  it("skips --flag and its value", () => {
    expect(parseStatusPrNumbers(["--format", "json", "42"])).toEqual([42]);
  });

  it("skips a known value flag at the end of the argv", () => {
    expect(parseStatusPrNumbers(["--message"])).toEqual([]);
  });

  it("skips boolean flags", () => {
    expect(parseStatusPrNumbers(["--dry-run", "42"])).toEqual([42]);
  });

  it("ignores non-numeric positional args", () => {
    expect(parseStatusPrNumbers(["abc", "42"])).toEqual([42]);
  });

  it("returns empty for no PR numbers", () => {
    expect(parseStatusPrNumbers(["--format", "json"])).toEqual([]);
  });
});
