import { describe, it, expect } from "vitest";
import { iterateActionToExitCode } from "./exit-codes.mts";
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
