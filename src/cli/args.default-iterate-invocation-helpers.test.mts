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

describe("default iterate invocation helpers", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.exitCode = undefined;
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    process.exitCode = undefined;
    stderrSpy.mockRestore();
  });

  it("recognizes omitted subcommand, PR numbers, PR URLs, and default flags", () => {
    expect(isDefaultIterateInvocation(undefined)).toBe(true);
    expect(isDefaultIterateInvocation("42")).toBe(true);
    expect(isDefaultIterateInvocation("https://github.com/o/r/pull/42")).toBe(true);
    expect(isDefaultIterateInvocation("--format=json")).toBe(true);
    expect(isDefaultIterateInvocation("--no-auto-mark-ready")).toBe(true);
    expect(isDefaultIterateInvocation("resolve")).toBe(false);
  });

  it("accepts a single PR plus known default iterate flags", () => {
    expect(
      validateDefaultIterateArgs([
        "42",
        "--format",
        "json",
        "--ready-delay=5m",
        "--stall-timeout",
        "1h",
        "--verbose",
      ]),
    ).toBe(true);
  });

  it("rejects missing values for default iterate value flags", () => {
    expect(validateDefaultIterateArgs(["42", "--ready-delay"])).toBe(false);
    expect(process.exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown subcommand"));
  });

  it("rejects duplicate PR-like positionals and unknown args", () => {
    expect(validateDefaultIterateArgs(["42", "43"])).toBe(false);
    expect(validateDefaultIterateArgs(["--unknown"])).toBe(false);
  });
});
