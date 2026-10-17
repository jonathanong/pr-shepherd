import { describe, expect, it } from "vitest";
import { makeIterateResult } from "../../fixtures/cli-parser.iterate-fixtures.mts";
import type { IterateResult, StackDraftHold } from "../types.mts";
import { formatIterateResult } from "./iterate-formatter.mts";
import { projectIterateLean } from "./iterate-lean.mts";

const handoff =
  "a `stack` command listed this session, finish that command's remaining steps and rerun it with its original flags; otherwise run `pr-shepherd stack https://github.com/owner/repo/pull/42 --until-terminal`, adding `--merge` when merging was requested. After the handoff, follow only the `stack` command's output.";

function heldWait(stackDraftHold: StackDraftHold): IterateResult {
  const wait = makeIterateResult("wait");
  if (wait.action !== "wait") throw new Error("expected wait fixture");
  return { ...wait, isDraft: true, stackDraftHold };
}

function textInstructions(result: IterateResult): string[] {
  const section = formatIterateResult(result).split("## Instructions\n\n")[1] ?? "";
  return section.split("\n").map((line) => line.replace(/^\d+\. /, ""));
}

function leanInstructions(result: IterateResult): string[] {
  const lean = projectIterateLean(result) as { stackDraftHold?: unknown; instructions: string[] };
  expect(lean.stackDraftHold).toEqual(result.action === "wait" && result.stackDraftHold);
  expect(textInstructions(result)).toEqual(lean.instructions);
  return lean.instructions;
}

describe("held native stack draft WAIT instructions", () => {
  it("returns a disabled mark-ready hold to the stack command", () => {
    expect(leanInstructions(heldWait({ kind: "auto-mark-ready-disabled" }))).toEqual([
      `PR #42 stays in draft because automatic mark-ready is disabled for this session, so repeating this one-PR session cannot advance it: do not rerun it or keep a wake-up for it. If ${handoff}`,
    ]);
  });

  it("hands a single tick's hold to one stack tick", () => {
    const [instruction] = leanInstructions(
      heldWait({ kind: "auto-mark-ready-disabled", once: true }),
    );
    expect(instruction).toContain(
      "run `pr-shepherd stack https://github.com/owner/repo/pull/42 --once`",
    );
  });

  it("keeps the stack handoff ahead of quota-aware cadence advice", () => {
    const result: IterateResult = {
      ...heldWait({ kind: "auto-mark-ready-disabled" }),
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
