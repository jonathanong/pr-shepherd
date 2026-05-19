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
