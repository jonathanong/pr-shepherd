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

// ---------------------------------------------------------------------------
// getFlag
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

// ---------------------------------------------------------------------------
// hasFlag
// ---------------------------------------------------------------------------

describe("hasFlag", () => {
  it("returns true when flag is present", () => {
    expect(hasFlag(["--dry-run", "42"], "--dry-run")).toBe(true);
  });

  it("returns false when flag is absent", () => {
    expect(hasFlag(["--format", "json"], "--dry-run")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseList
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

// ---------------------------------------------------------------------------
// parseStatusPrNumbers
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

// ---------------------------------------------------------------------------
// parseCommonArgs — PR number detection
// ---------------------------------------------------------------------------

describe("parseCommonArgs — PR number detection", () => {
  it("extracts PR number from positional arg", () => {
    const { prNumber } = parseCommonArgs(["42"]);
    expect(prNumber).toBe(42);
  });

  it("extracts PR number from a GitHub pull request URL", () => {
    const { prNumber } = parseCommonArgs(["https://github.com/owner/repo/pull/42"]);
    expect(prNumber).toBe(42);
  });

  it("does NOT treat unknown flag values as PR numbers", () => {
    const { prNumber } = parseCommonArgs(["--last-push-time", "100", "42"]);
    expect(prNumber).toBe(42);
  });

  it("does not skip past argv when a known value flag is missing its value", () => {
    const { prNumber, extra } = parseCommonArgs(["--message"]);
    expect(prNumber).toBeUndefined();
    expect(extra).toEqual(["--message"]);
  });

  it("supports --format=json inline form", () => {
    const { global: g } = parseCommonArgs(["--format=json", "42"]);
    expect(g.format).toBe("json");
  });

  it("sets verbose when --verbose is present and strips it from extra", () => {
    const { global: g, extra } = parseCommonArgs(["--verbose", "42", "--fetch"]);
    expect(g.verbose).toBe(true);
    expect(extra).toEqual(["--fetch"]);
  });

  it("skips known value flags in --flag=value form during PR detection", () => {
    const { prNumber, extra } = parseCommonArgs(["--thread-id=123", "42"]);
    expect(prNumber).toBe(42);
    expect(extra).toContain("--thread-id=123");
  });

  it("does not skip the value after unknown inline flags during PR detection", () => {
    const { prNumber } = parseCommonArgs(["--unknown=100", "42"]);
    expect(prNumber).toBe(42);
  });

  it("treats unknown standalone flags without following values as non-PR args", () => {
    const { prNumber } = parseCommonArgs(["--unknown", "--dry-run", "42"]);
    expect(prNumber).toBe(42);
  });

  it("supports --format json space form", () => {
    const { global: g } = parseCommonArgs(["--format", "json"]);
    expect(g.format).toBe("json");
  });

  it("defaults format to text", () => {
    const { global: g } = parseCommonArgs([]);
    expect(g.format).toBe("text");
  });

  it("keeps subcommand-specific flags in extra", () => {
    const { extra } = parseCommonArgs(["--format", "json", "--stall-timeout", "60"]);
    expect(extra).toContain("--stall-timeout");
    expect(extra).toContain("60");
  });

  it("strips global flags from extra", () => {
    const { extra } = parseCommonArgs(["--format", "json", "--stall-timeout", "60"]);
    expect(extra).not.toContain("--format");
    expect(extra).not.toContain("json");
    expect(extra).toContain("--stall-timeout");
  });

  it("strips inline --format=json form from extra", () => {
    const { extra } = parseCommonArgs(["--format=json", "--stall-timeout", "30"]);
    expect(extra).not.toContain("--format=json");
    expect(extra).toContain("--stall-timeout");
  });
});

// ---------------------------------------------------------------------------
// parseDurationToMinutes
// ---------------------------------------------------------------------------

describe("parseDurationToMinutes", () => {
  it("parses plain number as minutes", () => {
    expect(parseDurationToMinutes("5")).toBe(5);
  });

  it("parses Nm suffix", () => {
    expect(parseDurationToMinutes("10m")).toBe(10);
  });

  it("parses Nmin suffix", () => {
    expect(parseDurationToMinutes("15min")).toBe(15);
  });

  it("parses Nminutes suffix", () => {
    expect(parseDurationToMinutes("20minutes")).toBe(20);
  });

  it("parses Nh as hours → minutes", () => {
    expect(parseDurationToMinutes("2h")).toBe(120);
  });

  it("parses Nhours as hours → minutes", () => {
    expect(parseDurationToMinutes("1hours")).toBe(60);
  });

  it("uses explicit defaultMinutes for invalid input", () => {
    expect(parseDurationToMinutes("notaduration", 10)).toBe(10);
  });

  it("uses a different explicit defaultMinutes value", () => {
    expect(parseDurationToMinutes("notaduration", 15)).toBe(15);
  });

  it("falls back to configured default when invalid input has no explicit default", () => {
    expect(parseDurationToMinutes("notaduration")).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// statusToExitCode
// ---------------------------------------------------------------------------

describe("statusToExitCode", () => {
  it.each<[string, number]>([
    ["MERGED", 0],
    ["CLOSED", 0],
    ["READY", 0],
    ["IN_PROGRESS", 2],
    ["UNRESOLVED_COMMENTS", 3],
    ["FAILING", 1],
    ["UNKNOWN", 1],
    ["BLOCKED", 1],
  ])("%s → %d", (status, code) => {
    expect(statusToExitCode(status)).toBe(code);
  });
});

describe("iterateActionToExitCode", () => {
  it.each<[ShepherdAction, number]>([
    ["fix_code", 1],
    ["cancel", 2],
    ["escalate", 3],
    ["wait", 0],
    ["mark_ready", 0],
  ])("%s -> %d", (action, code) => {
    expect(iterateActionToExitCode(action)).toBe(code);
  });
});

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
