import { describe, expect, it } from "vitest";
import { makeIterateResult } from "../../fixtures/cli-parser.iterate-fixtures.mts";
import type { IterateResult, StackDraftHold } from "../types.mts";
import { formatIterateResult } from "./iterate-formatter.mts";
import { projectIterateLean } from "./iterate-lean.mts";

function heldWait(stackDraftHold: StackDraftHold): IterateResult {
  const wait = makeIterateResult("wait");
  if (wait.action !== "wait") throw new Error("expected wait fixture");
  return { ...wait, isDraft: true, stackDraftHold };
}

function textInstructions(result: IterateResult): string[] {
  const section = formatIterateResult(result).split("## Instructions\n\n")[1] ?? "";
  return section.split("\n").map((line) => line.replace(/^\d+\. /, ""));
}

describe("held native stack draft WAIT instructions", () => {
  it.each([
    ["auto-mark-ready-disabled", "automatic mark-ready is disabled for this session"],
    ["lower-layer-not-ready", "a lower stack layer has no current Shepherd READY receipt"],
  ] as const)("returns a %s hold to the stack selector", (hold, reason) => {
    const result = heldWait(hold);
    const lean = projectIterateLean(result) as { stackDraftHold?: string; instructions: string[] };

    expect(lean.stackDraftHold).toBe(hold);
    expect(textInstructions(result)).toEqual(lean.instructions);
    expect(lean.instructions).toEqual([
      `PR #42 stays in draft because ${reason}, so repeating this one-PR session cannot advance it. If a \`--stack\` selector listed this session, finish that selector's remaining steps and rerun it with its original flags; otherwise run \`pr-shepherd --stack https://github.com/owner/repo/pull/42 --until-terminal\`, adding \`--merge\` when merging was requested.`,
    ]);
  });

  it("keeps the stack handoff ahead of quota-aware cadence advice", () => {
    const result: IterateResult = {
      ...heldWait("auto-mark-ready-disabled"),
      quotaWarning: {
        resource: "graphql",
        thresholdPercent: 20,
        remaining: 900,
        limit: 5000,
        resetAt: 1_788_066_749,
        pollIntervalMinutes: 5,
        pollTimeoutMinutes: 10,
      },
    };

    const [instruction] = textInstructions(result);
    expect(instruction).toMatch(/^PR #42 stays in draft because automatic mark-ready is disabled/);
    expect(instruction).toContain("no more often than every 5 minutes");
    expect(instruction).not.toContain("Non-terminal — no action needed this tick");
  });

  it("omits the hold from an ordinary WAIT", () => {
    const result = makeIterateResult("wait");

    expect(projectIterateLean(result)).not.toHaveProperty("stackDraftHold");
    expect(textInstructions(result)[0]).toContain("Iterate immediately with the same options");
  });
});
