// @ts-nocheck
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { isDefaultPollInvocation, validateDefaultPollArgs } from "./default-poll.mts";

describe("default poll invocation helpers", () => {
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
    expect(isDefaultPollInvocation(undefined)).toBe(true);
    expect(isDefaultPollInvocation("42")).toBe(true);
    expect(isDefaultPollInvocation("https://github.com/o/r/pull/42")).toBe(true);
    expect(isDefaultPollInvocation("--format=json")).toBe(true);
    expect(isDefaultPollInvocation("--no-auto-mark-ready")).toBe(true);
    expect(isDefaultPollInvocation("--interval=45s")).toBe(true);
    expect(isDefaultPollInvocation("--timeout=4m")).toBe(true);
    expect(isDefaultPollInvocation("resolve")).toBe(false);
  });

  it("accepts a single PR plus known default poll flags", () => {
    expect(
      validateDefaultPollArgs([
        "42",
        "--format",
        "json",
        "--ready-delay=5m",
        "--stall-timeout",
        "1h",
        "--interval",
        "45",
        "--timeout",
        "4m",
        "--verbose",
      ]),
    ).toBe(true);
  });

  it("rejects missing values for default poll value flags", () => {
    expect(validateDefaultPollArgs(["42", "--ready-delay"])).toBe(false);
    expect(process.exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown subcommand"));
  });

  it("rejects duplicate PR-like positionals and unknown args", () => {
    expect(validateDefaultPollArgs(["42", "43"])).toBe(false);
    expect(validateDefaultPollArgs(["--unknown"])).toBe(false);
  });
});
