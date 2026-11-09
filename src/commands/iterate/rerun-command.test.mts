import { describe, expect, it } from "vitest";
import type { IterateResult } from "../../types.mts";
import { QUEUED_CONFLICT_CONTINUATION, isTriageContinuation } from "./check-instructions.mts";
import { withTriageRerunTarget } from "./rerun-command.mts";

function triage(instructions: string[]): IterateResult {
  return {
    action: "triage",
    repo: "acme/widgets",
    pr: 7,
    triage: { instructions },
  } as unknown as IterateResult;
}

function steps(result: IterateResult): string[] {
  return result.action === "triage" ? result.triage.instructions : [];
}

describe("withTriageRerunTarget", () => {
  it("names a qualified target's URL in the plain rerun step", () => {
    const result = withTriageRerunTarget(triage(["Fix it.", "Rerun Shepherd now."]), true);
    expect(steps(result)).toEqual([
      "Fix it.",
      "Rerun Shepherd now on `https://github.com/acme/widgets/pull/7`.",
    ]);
    expect(isTriageContinuation(steps(result).at(-1)!)).toBe(true);
  });

  it("leaves a bare target's rerun step alone", () => {
    const input = triage(["Rerun Shepherd now."]);
    expect(withTriageRerunTarget(input, false)).toBe(input);
  });

  it("leaves other final steps and other actions alone", () => {
    const queued = triage([QUEUED_CONFLICT_CONTINUATION]);
    expect(withTriageRerunTarget(queued, true)).toBe(queued);
    const wait = { action: "wait", repo: "acme/widgets", pr: 7 } as unknown as IterateResult;
    expect(withTriageRerunTarget(wait, true)).toBe(wait);
  });
});
