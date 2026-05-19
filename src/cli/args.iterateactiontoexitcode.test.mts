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
