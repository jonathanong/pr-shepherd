import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { warnPrrcThreadIds, validateRequireSha } from "./resolve-validators.mts";

describe("warnPrrcThreadIds", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });
  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it("returns empty and does not warn for an empty list", () => {
    expect(warnPrrcThreadIds([])).toEqual([]);
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("returns empty and does not warn for PRRT_ IDs only", () => {
    expect(warnPrrcThreadIds(["PRRT_abc", "PRRT_def"])).toEqual([]);
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("returns PRRC_ IDs and warns on stderr", () => {
    const result = warnPrrcThreadIds(["PRRT_1", "PRRC_2", "PRRC_3"]);
    expect(result).toEqual(["PRRC_2", "PRRC_3"]);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("PRRC_2, PRRC_3"));
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("PRRC_*"));
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("PRRT_*"));
  });

  it("warns when all IDs are PRRC_", () => {
    expect(warnPrrcThreadIds(["PRRC_1"])).toEqual(["PRRC_1"]);
    expect(stderrSpy).toHaveBeenCalled();
  });
});

describe("validateRequireSha", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    process.exitCode = undefined;
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });
  afterEach(() => {
    process.exitCode = undefined;
    stderrSpy.mockRestore();
  });

  it("returns true for undefined (flag absent)", () => {
    expect(validateRequireSha(undefined)).toBe(true);
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("returns true for a valid 40-char lowercase hex SHA", () => {
    expect(validateRequireSha("a".repeat(40))).toBe(true);
    expect(stderrSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it("rejects a 7-char short SHA", () => {
    expect(validateRequireSha("abc1234")).toBe(false);
    expect(process.exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("40-character"));
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("abc1234"));
  });

  it("rejects a 40-char uppercase hex string", () => {
    expect(validateRequireSha("A".repeat(40))).toBe(false);
    expect(process.exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("40-character"));
  });

  it("rejects a 40-char string with non-hex characters", () => {
    expect(validateRequireSha("g".repeat(40))).toBe(false);
    expect(process.exitCode).toBe(1);
  });

  it("rejects a 39-char string", () => {
    expect(validateRequireSha("a".repeat(39))).toBe(false);
    expect(process.exitCode).toBe(1);
  });

  it("rejects an empty string", () => {
    expect(validateRequireSha("")).toBe(false);
    expect(process.exitCode).toBe(1);
  });
});
