import { describe, it, expect } from "vitest";
import { parseCommonArgs } from "./args.mts";

// ---------------------------------------------------------------------------
// parseIntStrict
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

  it("does not make subcommand-only --tests a global boolean flag", () => {
    const { prNumber, extra } = parseCommonArgs(["--tests", "123", "--fetch"]);
    expect(prNumber).toBeUndefined();
    expect(extra).toEqual(["--tests", "123", "--fetch"]);
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
