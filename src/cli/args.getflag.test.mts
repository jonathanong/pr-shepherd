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
