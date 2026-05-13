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
