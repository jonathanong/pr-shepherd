// @ts-nocheck
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { validateSecondsDurationFlag } from "./duration-flag.mts";
import { parseDurationToSeconds } from "./exit-codes.mts";

describe("validateSecondsDurationFlag", () => {
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
    expect(validateSecondsDurationFlag("cmd", "--interval", null, false)).toBeUndefined();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("rejects a missing separate value", () => {
    expect(validateSecondsDurationFlag("cmd", "--interval", null, true)).toBeNull();
    expect(process.exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("requires a value"));
  });

  it("rejects the next flag as a value", () => {
    expect(validateSecondsDurationFlag("cmd", "--interval", "--timeout", true)).toBeNull();
    expect(process.exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("requires a value"));
  });

  it("rejects malformed durations", () => {
    expect(validateSecondsDurationFlag("cmd", "--interval", "soon", true)).toBeNull();
    expect(process.exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("invalid --interval"));
  });

  it("rejects zero", () => {
    expect(validateSecondsDurationFlag("cmd", "--interval", "0", true)).toBeNull();
    expect(process.exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("invalid --interval"));
  });

  it("rejects 0s", () => {
    expect(validateSecondsDurationFlag("cmd", "--interval", "0s", true)).toBeNull();
    expect(process.exitCode).toBe(1);
  });

  it("accepts bare integer (seconds)", () => {
    expect(validateSecondsDurationFlag("cmd", "--interval", "30", true)).toBe("30");
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("accepts Ns suffix", () => {
    expect(validateSecondsDurationFlag("cmd", "--interval", "30s", true)).toBe("30s");
  });

  it("accepts Nm suffix", () => {
    expect(validateSecondsDurationFlag("cmd", "--interval", "5m", true)).toBe("5m");
  });

  it("accepts Nh suffix", () => {
    expect(validateSecondsDurationFlag("cmd", "--interval", "1h", true)).toBe("1h");
  });

  it("returns trimmed value", () => {
    expect(validateSecondsDurationFlag("cmd", "--interval", " 30s ", true)).toBe("30s");
  });
});

describe("parseDurationToSeconds", () => {
  it("parses bare integer as seconds", () => {
    expect(parseDurationToSeconds("30", 60)).toBe(30);
  });

  it("parses Ns suffix", () => {
    expect(parseDurationToSeconds("45s", 60)).toBe(45);
  });

  it("parses Nsec suffix", () => {
    expect(parseDurationToSeconds("10sec", 60)).toBe(10);
  });

  it("parses Nseconds suffix", () => {
    expect(parseDurationToSeconds("20seconds", 60)).toBe(20);
  });

  it("parses Nm suffix as minutes", () => {
    expect(parseDurationToSeconds("5m", 60)).toBe(300);
  });

  it("parses Nmin suffix as minutes", () => {
    expect(parseDurationToSeconds("2min", 60)).toBe(120);
  });

  it("parses Nh suffix as hours", () => {
    expect(parseDurationToSeconds("1h", 60)).toBe(3600);
  });

  it("parses Nhours suffix as hours", () => {
    expect(parseDurationToSeconds("2hours", 60)).toBe(7200);
  });

  it("returns default for invalid input", () => {
    expect(parseDurationToSeconds("notaduration", 30)).toBe(30);
  });

  it("treats bare integer with no unit as seconds (not minutes)", () => {
    expect(parseDurationToSeconds("60", 0)).toBe(60);
  });
});
