import { describe, expect, it } from "vitest";
import { makeIterateResult } from "../../fixtures/cli-parser.iterate-fixtures.mts";
import type { IterateResult, StackDraftHold } from "../types.mts";
import { formatIterateResult } from "./iterate-formatter.mts";
import { projectIterateLean } from "./iterate-lean.mts";

const handoff =
  "a `--stack` selector listed this session, finish that selector's remaining steps and rerun it with its original flags; otherwise run `pr-shepherd --stack https://github.com/owner/repo/pull/42 --until-terminal`, adding `--merge` when merging was requested.";

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
  it.each([
    ["draft", "is still a draft"],
    ["no-ready-receipt", "has no current Shepherd READY receipt"],
    ["stale-ancestry", "is not rebased onto its parent layer's current head"],
  ] as const)("points a layer held by a %s lower layer at that layer", (reason, text) => {
    const result = heldWait({ kind: "lower-layer-not-ready", lowerLayer: { pr: 41, reason } });

    expect(leanInstructions(result)).toEqual([
      `PR #42 stays in draft because lower stack layer PR #41 ${text}, so repeating this one-PR session cannot advance it. Advance PR #41 first: if ${handoff}`,
    ]);
  });

  it.each([
    [{ kind: "auto-mark-ready-disabled" }, "automatic mark-ready is disabled for this session"],
    [{ kind: "lower-layer-not-ready" }, "its lower stack layers could not be verified"],
  ] as const)("returns an unattributed %j hold to the stack selector", (hold, reason) => {
    expect(leanInstructions(heldWait(hold))).toEqual([
      `PR #42 stays in draft because ${reason}, so repeating this one-PR session cannot advance it. If ${handoff}`,
    ]);
  });

  it("keeps the stack handoff ahead of quota-aware cadence advice", () => {
    const result: IterateResult = {
      ...heldWait({ kind: "lower-layer-not-ready", lowerLayer: { pr: 41, reason: "draft" } }),
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
    expect(instruction).toMatch(/^PR #42 stays in draft because lower stack layer PR #41/);
    expect(instruction).toContain("no more often than every 5 minutes");
    expect(instruction).not.toContain("Non-terminal — no action needed this tick");
  });

  it("omits the hold from an ordinary WAIT", () => {
    const result = makeIterateResult("wait");

    expect(projectIterateLean(result)).not.toHaveProperty("stackDraftHold");
    expect(textInstructions(result)[0]).toContain("Iterate immediately with the same options");
  });
});
