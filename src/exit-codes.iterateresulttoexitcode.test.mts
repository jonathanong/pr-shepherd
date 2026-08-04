import { describe, it, expect } from "vitest";
import { EXIT, iterateResultToExitCode } from "./exit-codes.mts";
import { makeIterateResult } from "../fixtures/cli-parser.iterate-fixtures.mts";
import type { CancelReason, ShepherdAction } from "./types.mts";

// ---------------------------------------------------------------------------
// iterateResultToExitCode
// ---------------------------------------------------------------------------

describe("iterateResultToExitCode", () => {
  it.each<[Exclude<ShepherdAction, "cancel">, number]>([
    ["wait", EXIT.WAIT],
    ["mark_ready", EXIT.MARK_READY],
    ["fix_code", EXIT.FIX_CODE],
    ["escalate", EXIT.ESCALATE],
  ])("%s -> %d", (action, code) => {
    expect(iterateResultToExitCode(makeIterateResult(action))).toBe(code);
  });

  it.each<[CancelReason, number]>([
    ["merged", EXIT.OK],
    ["ready-delay-elapsed", EXIT.OK],
    ["closed", EXIT.CLOSED],
  ])("cancel + %s -> %d", (reason, code) => {
    expect(iterateResultToExitCode(makeIterateResult("cancel", reason))).toBe(code);
  });
});
