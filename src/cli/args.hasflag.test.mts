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
import { isDefaultPollInvocation, validateDefaultPollArgs } from "./default-poll.mts";
import type { ShepherdAction } from "../types.mts";

// ---------------------------------------------------------------------------
// parseIntStrict
// ---------------------------------------------------------------------------

describe("hasFlag", () => {
  it("returns true when flag is present", () => {
    expect(hasFlag(["--dry-run", "42"], "--dry-run")).toBe(true);
  });

  it("returns false when flag is absent", () => {
    expect(hasFlag(["--format", "json"], "--dry-run")).toBe(false);
  });
});
