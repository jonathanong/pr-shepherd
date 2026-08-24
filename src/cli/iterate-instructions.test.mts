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
  const projection = projectIterateLean(result) as {
    instructions?: string[];
    fix?: { instructions?: string[] };
  };
  const instructions =
    result.action === "fix_code" ? projection.fix?.instructions : projection.instructions;
  if (!instructions) throw new Error("missing JSON instructions");
  return instructions;
}

describe("iterate instruction polling contract", () => {
  it.each(["wait", "mark_ready", "cancel", "escalate"] as const)(
    "%s text instructions equal the JSON instruction array",
    (action) => {
      const result = makeIterateResult(action);
      expect(textInstructions(result)).toEqual(jsonInstructions(result));
    },
  );

  it("fix_code text instructions equal fix.instructions", () => {
    const result = makeIterateResult("fix_code");
    expect(textInstructions(result)).toEqual(jsonInstructions(result));
  });
});
