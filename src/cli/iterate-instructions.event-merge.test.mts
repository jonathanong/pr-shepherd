import { describe, expect, it } from "vitest";
import { makeIterateResult } from "../../fixtures/cli-parser.iterate-fixtures.mts";
import type { IterateResult } from "../types.mts";
import { formatIterateResult } from "./iterate-formatter.mts";
import { projectIterateLean } from "./iterate-lean.mts";

function textInstructions(result: IterateResult): string[] {
  const section = formatIterateResult(result).split("## Instructions\n\n")[1];
  if (!section) throw new Error("missing Instructions section");
  return section.split("\n").map((line) => line.replace(/^\d+\. /, ""));
}

function jsonInstructions(result: IterateResult): string[] {
  const projection = projectIterateLean(result) as { instructions?: string[] };
  if (!projection.instructions) throw new Error("missing JSON instructions");
  return projection.instructions;
}

describe("event-mode REST merge instructions", () => {
  it("ends the turn after an event-mode REST merge instead of polling at a cadence", () => {
    const base = makeIterateResult("merge");
    if (base.action !== "merge") throw new Error("expected merge");
    const result: IterateResult = {
      ...base,
      merge: { ...base.merge, mode: "rest" },
      pollMode: "event",
      nextCheck: { at: "2024-05-15T19:12:00Z", inSeconds: 300, reason: "merge-pending" },
    };
    const steps = textInstructions(result);
    expect(steps).toEqual(jsonInstructions(result));
    expect(steps.join("\n")).not.toContain("polling cadence");
    expect(steps[1]).toMatch(/^Event mode: end this turn now/);
    expect(steps[2]).toContain(
      "Keep exactly one wake-up at `2024-05-15T19:12:00Z` (`merge-pending`)",
    );
  });
});
