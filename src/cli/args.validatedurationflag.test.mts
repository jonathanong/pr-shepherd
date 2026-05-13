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

describe("validateDurationFlag", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.exitCode = undefined;
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    process.exitCode = undefined;
    stderrSpy.mockRestore();
  });

  it("returns undefined when the flag is absent", () => {
    expect(validateDurationFlag("cmd", "--ready-delay", null, false)).toBeUndefined();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("rejects a missing separate value", () => {
    expect(validateDurationFlag("cmd", "--ready-delay", null, true)).toBeNull();
    expect(process.exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("requires a value"));
  });

  it("rejects the next flag as a value", () => {
    expect(validateDurationFlag("cmd", "--ready-delay", "--format", true)).toBeNull();
    expect(process.exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("requires a value"));
  });

  it("rejects malformed durations", () => {
    expect(validateDurationFlag("cmd", "--ready-delay", "soon", true)).toBeNull();
    expect(process.exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("invalid --ready-delay"));
  });

  it("returns trimmed valid durations", () => {
    expect(validateDurationFlag("cmd", "--ready-delay", " 2h ", true)).toBe("2h");
  });
});
